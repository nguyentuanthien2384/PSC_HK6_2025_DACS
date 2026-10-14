import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import HomePage from './HomePage';
import axios from '../../axios';

jest.mock('../../axios', () => ({ get: jest.fn() }));
jest.mock('react-router-dom', () => ({ Link: ({ children, to }) => <a href={to}>{children}</a> }), { virtual: true });
jest.mock('react-slick', () => ({ children, lazyLoad, autoplay, pauseOnFocus }) => <div data-testid="banners" data-lazy-load={lazyLoad} data-autoplay={autoplay} data-pause-on-focus={pauseOnFocus}>{children}</div>);

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

test('banner slides load on demand and stop animating in hidden tabs or when reduced motion is requested', async () => {
    localStorage.clear();
    const oldObserver = global.ResizeObserver;
    const oldMatchMedia = window.matchMedia;
    const motion = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    global.ResizeObserver = class { observe() {} disconnect() {} };
    window.matchMedia = jest.fn(() => motion);
    const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    axios.get.mockImplementation((url) => Promise.resolve({
        errCode: 0,
        data: url.includes('get-all-banner') ? [{ id: 1, name: 'Banner A', image: '/a.webp' }, { id: 2, name: 'Banner B', image: '/b.webp' }] : [],
    }));
    const { unmount } = render(<HomePage />);
    const slider = await screen.findByTestId('banners');
    expect(slider).toHaveAttribute('data-lazy-load', 'ondemand');
    expect(slider).toHaveAttribute('data-pause-on-focus', 'true');
    expect(slider).toHaveAttribute('data-autoplay', 'true');
    expect(document.querySelector('img[src="/a.webp"]')).toHaveAttribute('fetchpriority', 'high');
    expect(document.querySelector('img[src="/b.webp"]')).toHaveAttribute('loading', 'lazy');

    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(slider).toHaveAttribute('data-autoplay', 'false');
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(slider).toHaveAttribute('data-autoplay', 'true');
    const motionChanged = motion.addEventListener.mock.calls[0][1];
    motion.matches = true;
    act(() => motionChanged());
    expect(slider).toHaveAttribute('data-autoplay', 'false');
    unmount();
    expect(motion.removeEventListener).toHaveBeenCalledWith('change', motionChanged);
    visibility.mockRestore();
    global.ResizeObserver = oldObserver;
    window.matchMedia = oldMatchMedia;
    scroll.mockRestore();
});
