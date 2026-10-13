import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Header from './Header';
const mockDispatch = jest.fn();
let mockPathname = '/';
const mockNavProps = [];

jest.mock('react-router-dom', () => ({
    Link: ({ children, ...props }) => <a href={props.to}>{children}</a>,
    NavLink: ({ children, to, className, style, end, ...props }) => {
        mockNavProps.push({ to, end, ...props });
        const state = { isActive: mockPathname === to || (!end && to !== '/' && mockPathname.startsWith(`${to}/`)) };
        return <a href={to} {...props} className={typeof className === 'function' ? className(state) : className} style={typeof style === 'function' ? style(state) : style}>{children}</a>;
    },
    useLocation: () => ({ pathname: mockPathname }),
}), { virtual: true });
jest.mock('react-redux', () => ({ useSelector: () => [], useDispatch: () => mockDispatch }));
jest.mock('../../action/ShopCartAction', () => ({ getItemCartStart: jest.fn() }));
jest.mock('./TopMenu', () => () => <div>Top menu</div>);
jest.mock('../../component/Notifications/NotificationsBell', () => () => null);
jest.mock('../../utils/token', () => ({ getUser: () => null, getToken: () => null }));
beforeEach(() => { mockPathname = '/'; mockNavProps.length = 0; });

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

test('an open mobile menu closes when the shared header navigates to another page', () => {
    const { rerender } = render(<Header />);
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    mockPathname = '/shipper';
    rerender(<Header />);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('navbarSupportedContent')).not.toHaveClass('show');
});

test('React Router active navigation highlights only the matching page without legacy props', () => {
    const { rerender } = render(<Header />);
    const home = screen.getByRole('link', { name: 'Trang chủ' });
    const shop = screen.getByRole('link', { name: 'Cửa hàng' });
    expect(home).toHaveClass('active', 'selected');
    expect(home).toHaveStyle({ color: '#71cd14' });
    expect(shop).not.toHaveClass('selected');
    mockPathname = '/shop';
    rerender(<Header />);
    expect(home).not.toHaveClass('active', 'selected');
    expect(home).not.toHaveStyle({ color: '#71cd14' });
    expect(shop).toHaveClass('active', 'selected');
    expect(shop).toHaveStyle({ color: '#71cd14' });
    expect(mockNavProps.find(props => props.to === '/' && props.end)).toBeDefined();
    for (const props of mockNavProps) {
        expect(props).not.toHaveProperty('exact');
        expect(props).not.toHaveProperty('activeClassName');
        expect(props).not.toHaveProperty('activeStyle');
    }
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
