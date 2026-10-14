import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FormSearch from './FormSearch';

test('submitting a search with Enter calls the search handler without a native page reload', () => {
    const search = jest.fn(); const change = jest.fn();
    render(<FormSearch title="tên nhà cung cấp" handleSearch={search} handleOnchange={change} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm kiếm theo tên nhà cung cấp' }), { target: { value: 'Đối tác A' } });
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('search'), submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(search).toHaveBeenCalledWith('Đối tác A');
    expect(change).toHaveBeenCalledWith('Đối tác A');
    expect(screen.getByRole('button', { name: 'Tìm kiếm theo tên nhà cung cấp' })).toHaveAttribute('type', 'submit');
});
