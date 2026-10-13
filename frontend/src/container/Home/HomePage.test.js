import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import HomePage from './HomePage';
import axios from '../../axios';

jest.mock('../../axios', () => ({ get: jest.fn() }));
jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('react-slick', () => ({ children }) => <div>{children}</div>);

test('a StrictMode home visit starts one request per public collection instead of downloading each twice', async () => {
    localStorage.clear();
    const oldObserver = global.ResizeObserver;
    global.ResizeObserver = class { observe() {} disconnect() {} };
    const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    axios.get.mockImplementation((url) => Promise.resolve({
        errCode: 0,
        data: url.includes('get-product') ? [{ id: 1, name: 'Sản phẩm kiểm thử', productDetail: [{ originalPrice: 120000, productImage: [{ image: 'https://example.com/product.webp' }] }] }]
            : url.includes('get-all-banner') ? [{ id: 1, name: 'Bộ sưu tập', image: 'https://example.com/banner.webp' }] : [],
    }));
    const { unmount, container } = render(<React.StrictMode><HomePage /></React.StrictMode>);
    expect(container.querySelector('.store-home__banner-loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('heading', { name: 'Sản phẩm kiểm thử' })).toHaveLength(2));
    expect(axios.get).toHaveBeenCalledTimes(4);
    expect(new Set(axios.get.mock.calls.map(([url]) => url)).size).toBe(4);
    expect(container.querySelector('.store-home__banner-loading')).toBeNull();
    unmount();
    global.ResizeObserver = oldObserver;
    scroll.mockRestore();
});
