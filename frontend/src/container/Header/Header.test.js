import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Header from './Header';
const mockDispatch = jest.fn();

jest.mock('react-router-dom', () => ({ Link: ({ children, ...props }) => <a href={props.to}>{children}</a>, NavLink: ({ children, ...props }) => <a href={props.to}>{children}</a> }), { virtual: true });
jest.mock('react-redux', () => ({ useSelector: () => [], useDispatch: () => mockDispatch }));
jest.mock('../../action/ShopCartAction', () => ({ getItemCartStart: jest.fn() }));
jest.mock('./TopMenu', () => () => <div>Top menu</div>);
jest.mock('../../component/Notifications/NotificationsBell', () => () => null);
jest.mock('../../utils/token', () => ({ getUser: () => null, getToken: () => null }));

test('mobile menu works without a globally loaded Bootstrap or jQuery script', () => {
    render(<Header />);
    const button = screen.getByRole('button', { name: 'Toggle navigation' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('navbarSupportedContent')).toHaveClass('show');
    fireEvent.click(button);
    expect(document.getElementById('navbarSupportedContent')).not.toHaveClass('show');
});

test('scroll bursts update the shadow once per frame and queued work is cancelled on unmount', () => {
    const callbacks = [];
    const request = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callbacks.push(callback); return callbacks.length; });
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const { unmount } = render(<Header />);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100 });
    for (let index = 0; index < 8; index += 1) fireEvent.scroll(window);
    expect(request).toHaveBeenCalledTimes(1);
    act(() => callbacks[0]());
    expect(document.querySelector('.main_menu')).toHaveClass('sticky');
    fireEvent.scroll(window);
    unmount();
    expect(cancel).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    request.mockRestore();
    cancel.mockRestore();
});
