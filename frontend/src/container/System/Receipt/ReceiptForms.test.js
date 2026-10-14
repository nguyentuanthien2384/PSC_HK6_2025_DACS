import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddReceipt from './AddReceipt';
import DetailReceipt from './DetailReceipt';
import * as api from '../../../services/userService';

let mockReceiptId = '12';
jest.mock('react-router-dom', () => {
    global.TextEncoder = require('util').TextEncoder;
    const actual = jest.requireActual('../../../../node_modules/react-router/dist/development/index.js');
    return { ...actual, useParams: () => ({ id: mockReceiptId }) };
}, { virtual: true });
jest.mock('../../../services/userService', () => ({ getAllCodeService: jest.fn(), getAllProductAdmin: jest.fn(), getAllSupplier: jest.fn(), createNewReceiptService: jest.fn(), getDetailReceiptByIdService: jest.fn(), createNewReceiptDetailService: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ formatter: { format: value => `${value} đ` } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const products = [
    { id: 1, name: 'Sản phẩm chưa có biến thể', productDetail: [] },
    { id: 2, name: 'Áo thun', productDetail: [{ id: 20, nameDetail: 'Trắng chưa có cỡ', productDetailSize: [] }, { id: 21, nameDetail: 'Đen', productDetailSize: [{ id: 211, sizeId: 'M' }, { id: 212, sizeId: 'L' }] }] },
    { id: 3, name: 'Áo sơ mi', productDetail: [{ id: 30, nameDetail: 'Xanh', productDetailSize: [{ id: 301, sizeId: 'S' }] }] },
];
beforeEach(() => {
    jest.clearAllMocks(); mockReceiptId = '12';
    api.getAllProductAdmin.mockResolvedValue({ errCode: 0, data: products });
    api.getAllCodeService.mockResolvedValue({ errCode: 0, data: [{ code: 'size-s', value: 'S' }] });
    api.getAllSupplier.mockResolvedValue({ errCode: 0, data: [{ id: 9, name: 'Nhà cung cấp A' }] });
    api.createNewReceiptService.mockResolvedValue({ errCode: 0 });
    api.createNewReceiptDetailService.mockResolvedValue({ errCode: 0 });
    api.getDetailReceiptByIdService.mockResolvedValue({ errCode: 0, data: { receiptDetail: [{ id: 8, quantity: 2, price: 1000, productData: null, productDetailData: null, productDetailSizeData: null }] } });
});
const fill = (quantity = '2', price = '120000') => {
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: quantity } });
    fireEvent.change(screen.getByLabelText('Đơn giá (đ)'), { target: { value: price } });
};

test('receipt sizes show allcode labels with safe fallbacks and still submit the variant id', async () => {
    api.getAllProductAdmin.mockResolvedValue({ errCode: 0, data: [{ id: 7, name: 'Áo khoác', productDetail: [{ id: 70, nameDetail: 'Đen', productDetailSize: [
        { id: 701, sizeId: 'size-s' },
        { id: 702, sizeId: 'size-xl', sizeData: { value: 'XL' } },
        { id: 703, sizeId: 'size-custom' },
    ] }] }] });
    render(<MemoryRouter><AddReceipt /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).not.toBeDisabled());
    expect(screen.getByRole('option', { name: 'S' })).toHaveValue('701');
    expect(screen.getByRole('option', { name: 'XL' })).toHaveValue('702');
    expect(screen.getByRole('option', { name: 'size-custom' })).toHaveValue('703');
    expect(screen.queryByRole('option', { name: 'size-s' })).not.toBeInTheDocument();
    expect(api.getAllCodeService).toHaveBeenCalledWith('SIZE', { signal: expect.any(AbortSignal) });
    fill(); fireEvent.submit(screen.getByRole('form', { name: 'Tạo phiếu nhập hàng' }));
    await waitFor(() => expect(api.createNewReceiptService).toHaveBeenCalledWith({ supplierId: 9, productDetailSizeId: 701, quantity: 2, price: 120000 }));
});

test('receipt creation defaults to a usable variant, handles empty variants and resets dependent selections', async () => {
    render(<MemoryRouter><AddReceipt /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).not.toBeDisabled());
    expect(screen.getByLabelText('Sản phẩm')).toHaveValue('2');
    expect(screen.getByLabelText('Biến thể')).toHaveValue('21');
    expect(screen.getByLabelText('Kích thước')).toHaveValue('211');
    fireEvent.change(screen.getByLabelText('Sản phẩm'), { target: { value: '1' } });
    expect(screen.getByLabelText('Kích thước')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sản phẩm'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Biến thể'), { target: { value: '20' } });
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sản phẩm'), { target: { value: '3' } });
    expect(screen.getByLabelText('Kích thước')).toHaveValue('301');
    fill(); fireEvent.submit(screen.getByRole('form', { name: 'Tạo phiếu nhập hàng' }));
    await waitFor(() => expect(api.createNewReceiptService).toHaveBeenCalledWith({ supplierId: 9, productDetailSizeId: 301, quantity: 2, price: 120000 }));
    expect(api.getAllSupplier).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(api.getAllSupplier.mock.calls[0][0]).not.toHaveProperty('limit');
});

test('catalog failures can be retried and a missing supplier prevents an invalid receipt', async () => {
    api.getAllProductAdmin.mockRejectedValueOnce(new Error('Không kết nối được'));
    api.getAllSupplier.mockResolvedValue({ errCode: 0, data: [] });
    render(<MemoryRouter><AddReceipt /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được');
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await screen.findByText('Cần thêm nhà cung cấp trước khi tạo phiếu nhập.');
    expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).toBeDisabled();
    expect(api.createNewReceiptService).not.toHaveBeenCalled();
});

test('quantity validation and a pending receipt save prevent invalid or duplicate stock additions', async () => {
    let finish;
    api.createNewReceiptService.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<MemoryRouter><AddReceipt /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu phiếu nhập' })).not.toBeDisabled());
    fill('1.5'); fireEvent.submit(screen.getByRole('form', { name: 'Tạo phiếu nhập hàng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Số lượng phải là số nguyên');
    expect(api.createNewReceiptService).not.toHaveBeenCalled();
    fill();
    fireEvent.submit(screen.getByRole('form', { name: 'Tạo phiếu nhập hàng' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Tạo phiếu nhập hàng' }));
    expect(api.createNewReceiptService).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Sản phẩm')).toBeDisabled();
    await act(async () => { finish({ errCode: 0 }); });
    expect(screen.getByLabelText('Số lượng')).toHaveValue(null);
});

test('receipt detail tolerates missing historic product data and blocks stale route responses', async () => {
    let first;
    api.getDetailReceiptByIdService.mockReturnValueOnce(new Promise(resolve => { first = resolve; }));
    const view = render(<MemoryRouter><DetailReceipt /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Thêm vào phiếu nhập' })).toBeDisabled();
    mockReceiptId = '13'; view.rerender(<MemoryRouter><DetailReceipt /></MemoryRouter>);
    await screen.findByText('Sản phẩm không còn tồn tại');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm vào phiếu nhập' })).not.toBeDisabled());
    await act(async () => { first({ errCode: 0, data: { receiptDetail: [{ id: 99, productData: { name: 'Hàng của phiếu cũ' } }] } }); });
    expect(screen.queryByText('Hàng của phiếu cũ')).not.toBeInTheDocument();
    fill(); fireEvent.submit(screen.getByRole('form', { name: 'Thêm chi tiết phiếu nhập' }));
    await waitFor(() => expect(api.createNewReceiptDetailService).toHaveBeenCalledWith({ receiptId: '13', productDetailSizeId: 211, quantity: 2, price: 120000 }));
});
