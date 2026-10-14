import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import RoutePreload from './RoutePreload';

let pages;
beforeEach(() => {
    jest.useFakeTimers();
    window.history.replaceState(null, '', '/');
    Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined });
    pages = { '/shop': { preload: jest.fn().mockResolvedValue({}) }, '/detail-product/': { preload: jest.fn().mockResolvedValue({}) } };
});
afterEach(() => { jest.useRealTimers(); });

function mount() {
    return render(<><RoutePreload pages={pages} /><a href="/shop">Shop</a><a href="/detail-product/8"><span>Product</span></a><a href="https://example.com/shop">External</a><a href="/#details">Anchor</a></>);
}

test('only intentional hover or keyboard focus preloads the target page', () => {
    mount();
    expect(pages['/shop'].preload).not.toHaveBeenCalled();
    const link = screen.getByText('Shop');
    fireEvent.pointerOver(link);
    act(() => jest.advanceTimersByTime(40));
    fireEvent.pointerOut(link);
    act(() => jest.advanceTimersByTime(100));
    expect(pages['/shop'].preload).not.toHaveBeenCalled();
    fireEvent.pointerOver(link);
    act(() => jest.advanceTimersByTime(80));
    expect(pages['/shop'].preload).toHaveBeenCalledTimes(1);
    expect(pages['/detail-product/'].preload).not.toHaveBeenCalled();
    fireEvent.focusIn(screen.getByText('Product'));
    expect(pages['/detail-product/'].preload).toHaveBeenCalledTimes(1);
});

test('external links, current-page anchors and metered connections do not preload code', () => {
    mount();
    fireEvent.focusIn(screen.getByText('External'));
    fireEvent.focusIn(screen.getByText('Anchor'));
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    fireEvent.touchStart(screen.getByText('Product'));
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { effectiveType: 'slow-2g' } });
    fireEvent.focusIn(screen.getByText('Shop'));
    expect(pages['/shop'].preload).not.toHaveBeenCalled();
    expect(pages['/detail-product/'].preload).not.toHaveBeenCalled();
});

test('unmount cancels pending intent and a failed preload does not become an unhandled rejection', async () => {
    pages['/detail-product/'].preload.mockRejectedValue(new Error('offline'));
    const { unmount } = mount();
    fireEvent.touchStart(screen.getByText('Product'));
    await act(async () => {});
    fireEvent.pointerOver(screen.getByText('Shop'));
    unmount();
    act(() => jest.advanceTimersByTime(100));
    expect(pages['/shop'].preload).not.toHaveBeenCalled();
});
