import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import { addItemCartStart } from '../../action/ShopCartAction';
import InfoDetailProduct from './InfoDetailProduct';
import { renderToStaticMarkup } from 'react-dom/server.node';

jest.mock('react-redux', () => ({ useDispatch: jest.fn() }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../action/ShopCartAction', () => ({ addItemCartStart: jest.fn() }));

const dispatch = jest.fn();
const option = (id, label, stock) => ({ id, stock, sizeData: { value: label } });
const makeProduct = () => ({
    id: 7,
    name: 'Áo polo có các phiên bản màu',
    brandData: { value: 'Thương hiệu' },
    productDetail: [
        {
            id: 101,
            nameDetail: 'Kem',
            discountPrice: '300000',
            originalPrice: '350000',
            productDetailSize: [option(1001, 'S', 0), option(1002, 'M', 5), option(1003, 'L', 2)],
            productImage: [],
        },
        {
            id: 102,
            nameDetail: 'Đen',
            discountPrice: '320000',
            originalPrice: '350000',
            productDetailSize: [option(2001, 'S', 0), option(2002, 'M', 3), option(2003, 'L', 1)],
            productImage: [],
        },
        {
            id: 103,
            nameDetail: 'Nâu',
            discountPrice: '300000',
            originalPrice: '350000',
            productDetailSize: [option(3001, 'M', 0)],
            productImage: [],
        },
    ],
});

const quantityInput = () => screen.getByRole('spinbutton', { name: 'Số lượng' });
const addButton = () => screen.getByRole('button', { name: 'Thêm vào giỏ hàng' });

beforeEach(() => {
    jest.clearAllMocks();
    useDispatch.mockReturnValue(dispatch);
    addItemCartStart.mockImplementation((payload) => ({ type: 'test/add-cart', payload }));
});

test('initial selection skips sold-out variants and sizes and reports the selected stock', () => {
    const product = makeProduct();
    product.productDetail.unshift({
        id: 100, nameDetail: 'Trắng', discountPrice: '300000',
        productDetailSize: [option(999, 'S', 0)], productImage: [],
    });
    const onSelection = jest.fn();
    render(<InfoDetailProduct dataProduct={product} userId={42} sendDataFromInforDetail={onSelection} />);

    expect(screen.getByRole('combobox', { name: 'Phiên bản / màu sắc' })).toHaveValue('101');
    expect(screen.getByRole('button', { name: 'S', exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'M', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('5 sản phẩm có sẵn');
    expect(quantityInput()).toHaveAttribute('max', '5');
    expect(onSelection).toHaveBeenLastCalledWith(product.productDetail[1].productDetailSize[1]);
    expect(addButton()).toBeEnabled();
});

test('choosing another size resets quantity and uses that size stock for quantity controls', () => {
    const onSelection = jest.fn();
    const product = makeProduct();
    render(<InfoDetailProduct dataProduct={product} userId={42} sendDataFromInforDetail={onSelection} />);
    fireEvent.change(quantityInput(), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'L', exact: true }));

    expect(quantityInput()).toHaveValue(1);
    expect(quantityInput()).toHaveAttribute('max', '2');
    expect(screen.getByRole('status')).toHaveTextContent('2 sản phẩm có sẵn');
    expect(screen.getByRole('button', { name: 'Giảm số lượng' })).toBeDisabled();
    expect(onSelection).toHaveBeenLastCalledWith(product.productDetail[0].productDetailSize[2]);

    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng' }));
    expect(quantityInput()).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
});

test('changing variant resets the size and quantity and cannot send the previous variant size to the cart', () => {
    const product = makeProduct();
    const onSelection = jest.fn();
    render(<InfoDetailProduct dataProduct={product} userId={42} sendDataFromInforDetail={onSelection} />);
    fireEvent.click(screen.getByRole('button', { name: 'L', exact: true }));
    fireEvent.change(quantityInput(), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Phiên bản / màu sắc' }), { target: { value: '102' } });

    expect(screen.getByRole('button', { name: 'M', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'L', exact: true })).toHaveAttribute('aria-pressed', 'false');
    expect(quantityInput()).toHaveValue(1);
    expect(quantityInput()).toHaveAttribute('max', '3');
    expect(screen.getByRole('status')).toHaveTextContent('3 sản phẩm có sẵn');
    expect(onSelection).toHaveBeenLastCalledWith(product.productDetail[1].productDetailSize[1]);

    fireEvent.click(addButton());
    expect(addItemCartStart).toHaveBeenCalledWith({ userId: 42, productdetailsizeId: 2002, quantity: 1 });
});

test.each(['1.5', '-1', '6'])('quantity %s is rejected before dispatching a cart action', (quantity) => {
    render(<InfoDetailProduct dataProduct={makeProduct()} userId={42} />);
    fireEvent.change(quantityInput(), { target: { value: quantity } });
    fireEvent.click(addButton());

    expect(toast.error).toHaveBeenCalledWith('Số lượng phải là số nguyên và không vượt quá tồn kho.');
    expect(addItemCartStart).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
});

test('a valid cart action contains the selected size identity and numeric quantity without client prices', () => {
    render(<InfoDetailProduct dataProduct={makeProduct()} userId={42} />);
    fireEvent.click(screen.getByRole('button', { name: 'L', exact: true }));
    fireEvent.change(quantityInput(), { target: { value: '2' } });
    fireEvent.click(addButton());

    const payload = { userId: 42, productdetailsizeId: 1003, quantity: 2 };
    expect(addItemCartStart).toHaveBeenCalledTimes(1);
    expect(addItemCartStart).toHaveBeenCalledWith(payload);
    expect(dispatch).toHaveBeenCalledWith({ type: 'test/add-cart', payload });
    expect(toast.error).not.toHaveBeenCalled();
});

test('a sold-out variant disables its size, quantity controls and cart action', () => {
    render(<InfoDetailProduct dataProduct={makeProduct()} userId={42} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Phiên bản / màu sắc' }), { target: { value: '103' } });

    expect(screen.getByRole('button', { name: 'M', exact: true })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Lựa chọn này hiện chưa có hàng');
    expect(quantityInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Giảm số lượng' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tăng số lượng' })).toBeDisabled();
    expect(addButton()).toBeDisabled();
    fireEvent.click(addButton());
    expect(addItemCartStart).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
});

test.each([
    { discountPrice: null, originalPrice: undefined },
    { discountPrice: 'invalid', originalPrice: '' },
])('in-stock products with no usable price require contact and cannot be added to the cart (%#)', (prices) => {
    const product = makeProduct();
    product.productDetail = [{ ...product.productDetail[0], ...prices }];
    render(<InfoDetailProduct dataProduct={product} userId={42} />);

    expect(screen.getByText('Liên hệ')).toBeInTheDocument();
    expect(quantityInput()).toBeDisabled();
    expect(addButton()).toBeDisabled();
    fireEvent.click(addButton());
    expect(addItemCartStart).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
});

test('a missing discount price still permits purchase when an original price is available', () => {
    const product = makeProduct();
    product.productDetail = [{ ...product.productDetail[0], discountPrice: null }];
    render(<InfoDetailProduct dataProduct={product} userId={42} />);

    expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
    expect(quantityInput()).toBeEnabled();
    expect(addButton()).toBeEnabled();
    fireEvent.click(addButton());
    expect(addItemCartStart).toHaveBeenCalledWith({ userId: 42, productdetailsizeId: 1002, quantity: 1 });
});

test('an anonymous shopper receives a login prompt without dispatching a cart action', () => {
    render(<InfoDetailProduct dataProduct={makeProduct()} />);
    fireEvent.click(addButton());

    expect(toast.error).toHaveBeenCalledWith('Đăng nhập để thêm vào giỏ hàng.');
    expect(addItemCartStart).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
});

test('the zoom image is mounted only while the shopper opens the preview', () => {
    const product = makeProduct();
    product.productDetail[0].productImage = [{ id: 1, image: 'http://localhost:6969/api/media/product-images/1/version/detail', caption: 'Ảnh sản phẩm' }];
    render(<InfoDetailProduct dataProduct={product} />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    dialog.showModal = jest.fn();
    dialog.close = jest.fn();
    expect(dialog.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Phóng to ảnh sản phẩm' }));
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector('img')).toHaveAttribute('decoding', 'async');
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh phóng to', hidden: true }));
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector('img')).toBeNull();
});

test('the first render already chooses the stocked variant and its photo without loading a sold-out photo first', () => {
    const product = makeProduct();
    product.productDetail[0].productImage = [{ id: 2, image: 'https://example.com/available.webp' }];
    product.productDetail.unshift({
        id: 100, nameDetail: 'Trắng', discountPrice: '300000',
        productDetailSize: [option(999, 'S', 0)],
        productImage: [{ id: 1, image: 'https://example.com/sold-out.webp' }],
    });
    // Static rendering does not run effects, so this catches an incorrect image
    // request before the effect selects the first available variant.
    const firstRender = document.createElement('div');
    firstRender.innerHTML = renderToStaticMarkup(<InfoDetailProduct dataProduct={product} />);
    expect(firstRender.querySelector('.product-buy__main-image img')).toHaveAttribute('src', 'https://example.com/available.webp');
    expect(firstRender.querySelector('.product-buy__availability')).toHaveTextContent('5 sản phẩm có sẵn');
    expect(firstRender.querySelector('[src="https://example.com/sold-out.webp"]')).toBeNull();
});
