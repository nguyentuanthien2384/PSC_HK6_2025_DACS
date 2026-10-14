import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ItemProduct from './ItemProduct';

jest.mock('react-router-dom', () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });

test('catalog cards use the small image variant and reserve square dimensions before decoding', () => {
    render(<ItemProduct id={7} name="Áo polo" img="http://localhost:6969/api/media/product-images/7/123456/detail" />);
    const image = screen.getByRole('img', { name: 'Áo polo' });
    expect(image).toHaveAttribute('src', 'http://localhost:6969/api/media/product-images/7/123456/card');
    expect(image).toHaveAttribute('width', '480');
    expect(image).toHaveAttribute('height', '480');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('loading', 'lazy');
});

test('the initial shop row starts image loading immediately and a changed image recovers from errors', () => {
    const { rerender } = render(<ItemProduct id={7} name="Áo polo" img="https://example.com/a.webp" eager />);
    expect(screen.getByRole('img')).toHaveAttribute('loading', 'eager');
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Đang cập nhật ảnh')).toBeInTheDocument();
    rerender(<ItemProduct id={7} name="Áo polo" img="https://example.com/b.webp" eager />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/b.webp');
});
