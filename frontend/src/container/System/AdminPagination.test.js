import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AdminPagination from './AdminPagination';

test('pagination mounts without a request, has noninteractive ellipses and navigates with accessible buttons', () => {
    const onPageChange = jest.fn();
    const view = render(<AdminPagination pageCount={134} forcePage={0} total={800} pageSize={6} onPageChange={onPageChange} ariaLabel="Phân trang tồn kho" />);
    const navigation = screen.getByRole('navigation', { name: 'Phân trang tồn kho' });
    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.getByText('Trang 1 / 134 · 1–6 / 800 kết quả')).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('…').closest('li')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Trang 134' }));
    expect(onPageChange).toHaveBeenLastCalledWith({ selected: 133 });
    view.rerender(<AdminPagination pageCount={134} forcePage={133} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang 134' })).toHaveAttribute('aria-current', 'page');
});

test('pending list requests block navigation without removing page controls', () => {
    const onPageChange = jest.fn();
    render(<AdminPagination pageCount={8} forcePage={3} loading onPageChange={onPageChange} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-busy', 'true');
    screen.getAllByRole('button').forEach(button => expect(button).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).not.toHaveBeenCalled();
});

test('empty lists have no page controls and one-page lists report the page without dead navigation', () => {
    const view = render(<AdminPagination pageCount={0} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    view.rerender(<AdminPagination pageCount={1} />);
    expect(screen.getByText('Trang 1 / 1')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
