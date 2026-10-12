import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { addShopCartService } from '../../services/userService';
import ShopCartItem from './ShopCartItem';

jest.mock('react-redux', () => ({ useDispatch: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../action/ShopCartAction', () => ({ getItemCartStart: id => ({ type: 'refresh', id }) }));
jest.mock('../../services/userService', () => ({ addShopCartService: jest.fn(), deleteItemShopCartService: jest.fn() }));
jest.mock('../../container/ShopCart/DeleteShopCartModal', () => () => null);
jest.mock('../../utils/CommonUtils', () => ({ formatter: { format: value => String(value) } }));
const dispatch = jest.fn();
const props = { id: 1, userId: 2, productdetailsizeId: 3, name: 'Áo - M', quantity: 2, stock: 20, available: true, price: 100000, isOrder: false };
const view = extra => render(<table><tbody><ShopCartItem {...props} {...extra} /></tbody></table>);
beforeEach(() => {
    jest.clearAllMocks();
    useDispatch.mockReturnValue(dispatch);
    addShopCartService.mockResolvedValue({ errCode: 0 });
});

test('typing a multi-digit quantity makes one update when the customer finishes editing', async () => {
    const onEditingChange = jest.fn();
    view({ onEditingChange });
    const input = screen.getByRole('spinbutton', { name: 'Số lượng Áo - M' });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '12' } });
    expect(addShopCartService).not.toHaveBeenCalled();
    expect(onEditingChange).toHaveBeenLastCalledWith(1, true);
    fireEvent.blur(input);
    await waitFor(() => expect(addShopCartService).toHaveBeenCalledTimes(1));
    expect(addShopCartService).toHaveBeenCalledWith({ type: 'UPDATE_QUANTITY', userId: 2, productdetailsizeId: 3, quantity: 12 });
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'refresh', id: 2 }));
});

test('overstock edits are rejected locally and server rejection refreshes current inventory', async () => {
    view({ stock: 4 });
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.blur(input);
    expect(addShopCartService).not.toHaveBeenCalled();
    expect(input).toHaveValue(2);
    expect(toast.error).toHaveBeenCalledWith('Chỉ còn 4 sản phẩm');
    addShopCartService.mockResolvedValue({ errCode: 2, errMessage: 'Chỉ còn 1 sản phẩm', quantity: 1 });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'refresh', id: 2 }));
    expect(input).toHaveValue(2);
});

test('sold-out cart items keep deletion available and explain disabled quantity editing', () => {
    view({ available: false, stock: 0, availabilityError: 'Sản phẩm đã hết hàng.' });
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Sản phẩm đã hết hàng.');
    expect(screen.getByText('Xóa')).toBeInTheDocument();
});
