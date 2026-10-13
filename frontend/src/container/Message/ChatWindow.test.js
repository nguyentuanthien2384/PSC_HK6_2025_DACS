import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ChatWindow from './ChatWindow';
import socketIOClient from 'socket.io-client';
import { loadMessage } from '../../services/userService';
import { toast } from 'react-toastify';

jest.mock('socket.io-client', () => ({ connect: jest.fn() }));
jest.mock('../../services/userService', () => ({ loadMessage: jest.fn() }));
jest.mock('../../axios', () => ({ API_BASE_URL: 'http://localhost:6969' }));
jest.mock('../../utils/token', () => ({ getToken: () => 'token', getUser: () => ({ id: 4 }) }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('bootstrap/js/dist/dropdown', () => ({}));

const messages = text => ({ errCode: 0, data: [{ id: 1, text, createdAt: '2026-10-13T00:00:00Z', userData: { id: 4, firstName: 'A', lastName: 'B', image: '/avatar.png' } }] });
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const sockets = [];
beforeEach(() => {
    jest.clearAllMocks();
    sockets.length = 0;
    loadMessage.mockResolvedValue(messages('Tin nhắn hiện tại'));
    socketIOClient.connect.mockImplementation(() => {
        const socket = { connected: true, handlers: {}, disconnect: jest.fn(), timeout: jest.fn(), emit: jest.fn() };
        socket.on = jest.fn((event, handler) => { socket.handlers[event] = handler; return socket; });
        socket.timeout.mockReturnValue(socket);
        sockets.push(socket);
        return socket;
    });
});

test('a slow response for the previous room cannot replace messages after switching rooms', async () => {
    const old = deferred();
    loadMessage.mockImplementation(room => room === 1 ? old.promise : Promise.resolve(messages('Tin nhắn phòng mới')));
    const { rerender } = render(<ChatWindow roomId={1} userId={4} />);
    rerender(<ChatWindow roomId={2} userId={4} />);
    await screen.findByText('Tin nhắn phòng mới');
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    await act(async () => old.resolve(messages('Tin nhắn phòng cũ')));
    expect(screen.queryByText('Tin nhắn phòng cũ')).not.toBeInTheDocument();
    expect(screen.getByText('Tin nhắn phòng mới')).toBeInTheDocument();
});

test('socket events for another room do not reload the open conversation', async () => {
    render(<ChatWindow roomId={1} userId={4} />);
    await screen.findByText('Tin nhắn hiện tại');
    act(() => sockets[0].handlers.sendDataServer({ roomId: 2 }));
    expect(loadMessage).toHaveBeenCalledTimes(1);
    act(() => sockets[0].handlers.sendDataServer({ roomId: 1 }));
    expect(loadMessage).toHaveBeenCalledTimes(2);
    await act(async () => {});
});

test('overlapping updates of one room cannot let an older read overwrite newer messages', async () => {
    const old = deferred();
    const latest = deferred();
    loadMessage.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    render(<ChatWindow roomId={1} userId={4} />);
    act(() => sockets[0].handlers.sendDataServer({ roomId: 1 }));
    await act(async () => latest.resolve(messages('Tin nhắn mới nhất')));
    await act(async () => old.resolve(messages('Tin nhắn lỗi thời')));
    expect(screen.getByText('Tin nhắn mới nhất')).toBeInTheDocument();
    expect(screen.queryByText('Tin nhắn lỗi thời')).not.toBeInTheDocument();
});

test('a send acknowledgement from the previous room cannot clear the new draft or reload its messages', async () => {
    const { rerender } = render(<ChatWindow roomId={1} userId={4} />);
    await screen.findByText('Tin nhắn hiện tại');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nội dung cũ' } });
    fireEvent.click(screen.getByText('Send'));
    const acknowledge = sockets[0].emit.mock.calls[0][2];
    rerender(<ChatWindow roomId={2} userId={4} />);
    await screen.findByText('Tin nhắn hiện tại');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nội dung phòng mới' } });
    const reads = loadMessage.mock.calls.length;
    act(() => acknowledge(null, { errCode: 0 }));
    expect(screen.getByRole('textbox')).toHaveValue('Nội dung phòng mới');
    expect(loadMessage).toHaveBeenCalledTimes(reads);
    expect(toast.error).not.toHaveBeenCalled();
});
