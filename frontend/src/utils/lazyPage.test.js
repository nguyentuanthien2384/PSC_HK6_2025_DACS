import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { lazyPage } from './lazyPage';

test('intent preloading and navigation share one import and reuse only the page code', async () => {
    const loader = jest.fn().mockResolvedValue({ default: ({ name }) => <div>{name}</div> });
    const Page = lazyPage(loader);
    await Page.preload();
    await Page.preload();
    const { rerender } = render(<Page name="Current product" />);
    expect(await screen.findByText('Current product')).toBeInTheDocument();
    rerender(<Page name="Next product" />);
    expect(screen.getByText('Next product')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
});

test('a failed speculative import can be retried by a later navigation', async () => {
    const loader = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ default: () => <div>Shop loaded</div> });
    const Page = lazyPage(loader);
    await expect(Page.preload()).rejects.toThrow('offline');
    await act(async () => { render(<Page />); });
    expect(screen.getByText('Shop loaded')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
});

test('a failed navigation import shows recovery without unmounting the storefront shell', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
        const Page = lazyPage(() => Promise.reject(new Error('chunk unavailable')));
        await act(async () => { render(<><header>Shop header</header><Page /><footer>Shop footer</footer></>); });
        expect(screen.getByRole('alert')).toHaveTextContent('Chưa thể tải trang');
        expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
        expect(screen.getByText('Shop header')).toBeInTheDocument();
        expect(screen.getByText('Shop footer')).toBeInTheDocument();
    } finally { errorLog.mockRestore(); }
});
