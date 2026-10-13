import React from 'react';
import { render } from '@testing-library/react';
import RouteScrollReset from './RouteScrollReset';

let mockLocation;
jest.mock('react-router-dom', () => ({ useLocation: () => mockLocation }), { virtual: true });

let scroll;
beforeEach(() => {
    mockLocation = { pathname: '/shop', search: '', hash: '' };
    scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => scroll.mockRestore());

test('entering delivery from a scrolled page resets the viewport before page content loads', () => {
    const { rerender } = render(<RouteScrollReset />);
    scroll.mockClear();
    mockLocation = { pathname: '/shipper', search: '?tab=working', hash: '' };
    rerender(<RouteScrollReset />);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith(0, 0);
});

test('changing tabs, filters and anchors on the same route keeps the current viewport', () => {
    const { rerender } = render(<RouteScrollReset />);
    scroll.mockClear();
    mockLocation = { pathname: '/shop', search: '?page=2', hash: '' };
    rerender(<RouteScrollReset />);
    mockLocation = { pathname: '/shop', search: '?page=2', hash: '#products' };
    rerender(<RouteScrollReset />);
    expect(scroll).not.toHaveBeenCalled();
});

test('explicit guide anchors are preserved when entering another route', () => {
    const { rerender } = render(<RouteScrollReset />);
    scroll.mockClear();
    mockLocation = { pathname: '/about', search: '', hash: '#giao-hang' };
    rerender(<RouteScrollReset />);
    expect(scroll).not.toHaveBeenCalled();
    mockLocation = { pathname: '/notifications', search: '', hash: '' };
    rerender(<RouteScrollReset />);
    expect(scroll).toHaveBeenCalledWith(0, 0);
});
