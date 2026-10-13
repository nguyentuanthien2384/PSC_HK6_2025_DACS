import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Adduser from './Adduser';
import { useParams } from 'react-router-dom';
import { createNewUser, getDetailUserById, UpdateUserService } from '../../../services/userService';

jest.mock('react-router-dom', () => ({ useParams: jest.fn() }), { virtual: true });
jest.mock('react-datepicker', () => () => <input aria-label="Ngày sinh" readOnly />);
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../services/userService', () => ({ createNewUser: jest.fn(), getDetailUserById: jest.fn(), UpdateUserService: jest.fn() }));
jest.mock('../../customize/fetch', () => ({ useFetchAllcode: type => ({ data: type === 'ROLE' ? [{ code: 'R2', value: 'Khách hàng' }, { code: 'R4', value: 'Nhân viên' }] : [{ code: 'M', value: 'Nam' }] }) }));
beforeEach(() => {
    jest.clearAllMocks();
    getDetailUserById.mockResolvedValue({ errCode: 0, data: { id: 2, roleId: 'R2', genderId: 'M', firstName: 'Nguyễn', lastName: 'An', email: 'an@example.test', phonenumber: '0901234567', address: 'Hà Nội', dob: 946684800000 } });
    UpdateUserService.mockResolvedValue({ errCode: 0 }); createNewUser.mockResolvedValue({ errCode: 0 });
});

test('editing a profile cannot change roles or send a stale cached role back to the API', async () => {
    useParams.mockReturnValue({ id: '2' }); render(<Adduser />);
    await screen.findByDisplayValue('an@example.test');
    await waitFor(() => expect(screen.getByLabelText('Quyền')).toHaveValue('R2'));
    expect(screen.getByLabelText('Quyền')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quyền'), { target: { value: 'R4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(UpdateUserService).toHaveBeenCalledWith(expect.objectContaining({ id: 2, firstName: 'Nguyễn' })));
    expect(UpdateUserService.mock.calls[0][0]).not.toHaveProperty('roleId');
});

test('new account creation still accepts the explicitly selected role', async () => {
    useParams.mockReturnValue({}); render(<Adduser />); expect(screen.getByLabelText('Quyền')).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quyền'), { target: { value: 'R4' } }); fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(createNewUser).toHaveBeenCalledWith(expect.objectContaining({ roleId: 'R4' })));
    expect(createNewUser.mock.calls[0][0].genderId).toBe('M');
});

test('a slow earlier account cannot overwrite another account after changing the edit route', async () => {
    let first, second;
    getDetailUserById.mockReturnValueOnce(new Promise(resolve => { first = resolve; })).mockReturnValueOnce(new Promise(resolve => { second = resolve; }));
    useParams.mockReturnValue({ id: '2' });
    const view = render(<Adduser />);
    expect(screen.getByRole('button', { name: 'Lưu thông tin' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect(UpdateUserService).not.toHaveBeenCalled();
    useParams.mockReturnValue({ id: '3' }); view.rerender(<Adduser />);
    await act(async () => { second({ errCode: 0, data: { id: 3, firstName: 'Trần', lastName: 'Bình', email: 'binh@example.test', genderId: 'M', roleId: 'R2' } }); });
    await screen.findByDisplayValue('binh@example.test');
    await act(async () => { first({ errCode: 0, data: { id: 2, firstName: 'Nguyễn', lastName: 'An', email: 'an@example.test' } }); });
    expect(screen.queryByDisplayValue('an@example.test')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(UpdateUserService).toHaveBeenCalledWith(expect.objectContaining({ id: 3, firstName: 'Trần' })));
});
