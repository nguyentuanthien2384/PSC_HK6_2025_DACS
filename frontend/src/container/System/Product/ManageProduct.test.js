import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManageProduct, { catalogExportRows } from './ManageProduct';
import * as catalog from '../../../services/adminCatalogService';
import CommonUtils from '../../../utils/CommonUtils';

jest.mock('react-router-dom', () => ({ Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a> }), { virtual: true });
jest.mock('../../../services/adminCatalogService', () => ({ getAdminCatalog: jest.fn(), updateAdminCatalogStatus: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ exportExcel: jest.fn() }));
const product = { id: 1, name: 'Áo sơ mi', statusId: 'S1', priceMin: 100000, priceMax: 150000, variantCount: 4, view: 10, image: 'http://localhost:6969/api/media/product-images/4/123/card', categoryData: { value: 'Áo', code: 'C1' }, brandData: { value: 'DACS', code: 'B1' } };
const response = (data = [product], extra = {}) => ({ errCode: 0, data, count: 25, page: 1, pageSize: 20, pages: 2, filters: { categories: [{ code: 'C1', value: 'Áo' }], brands: [{ code: 'B1', value: 'DACS' }] }, ...extra });
beforeEach(() => { jest.clearAllMocks(); catalog.getAdminCatalog.mockResolvedValue(response()); catalog.updateAdminCatalogStatus.mockResolvedValue({ errCode: 0, changed: 1, skipped: 0, failed: 0, data: [{ id: 1, outcome: 'changed' }] }); CommonUtils.exportExcel.mockResolvedValue('oke'); });

test('catalog uses lightweight rows, explicit filters, metadata paging and existing editor/detail routes', async () => {
    render(<ManageProduct />); expect(await screen.findByRole('link', { name: 'Áo sơ mi' })).toHaveAttribute('href', '/system/home/list-product-detail/1');
    expect(screen.getByRole('link', { name: 'Chỉnh sửa' })).toHaveAttribute('href', '/system/home/edit-product/1');
    expect(screen.getByRole('link', { name: '+ Thêm sản phẩm' })).toHaveAttribute('href', '/system/home/add-product');
    expect(screen.getByText('100.000 ₫')).toBeInTheDocument(); expect(screen.getByText('đến 150.000 ₫')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(catalog.getAdminCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 }), expect.any(AbortSignal)));
    await screen.findByRole('link', { name: 'Áo sơ mi' });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S2' } });
    await waitFor(() => expect(catalog.getAdminCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, statusId: 'S2' }), expect.any(AbortSignal)));
    fireEvent.change(screen.getByLabelText('Tên sản phẩm'), { target: { value: ' Áo mới ' } }); fireEvent.click(screen.getByRole('button', { name: 'Tìm kiếm' }));
    await waitFor(() => expect(catalog.getAdminCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'Áo mới', statusId: 'S2', page: 1 }), expect.any(AbortSignal)));
});

test('stale responses are ignored and errors offer retry without old product actions', async () => {
    let resolveInitial; catalog.getAdminCatalog.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; })).mockResolvedValueOnce(response([{ ...product, name: 'Kết quả mới' }])).mockRejectedValueOnce(new Error('Mất kết nối'));
    render(<ManageProduct />); fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S2' } });
    await screen.findByRole('link', { name: 'Kết quả mới' }); await act(async () => resolveInitial(response()));
    expect(screen.queryByRole('link', { name: 'Áo sơ mi' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: 'C1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối'); expect(screen.queryByRole('link', { name: 'Kết quả mới' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' })); expect(await screen.findByRole('link', { name: 'Áo sơ mi' })).toBeInTheDocument();
});

test('hide/restore requires an explicit reason, prevents duplicate submissions and keeps current filters', async () => {
    let resolveMutation; catalog.updateAdminCatalogStatus.mockImplementationOnce(() => new Promise(resolve => { resolveMutation = resolve; }));
    render(<ManageProduct />); await screen.findByRole('link', { name: 'Áo sơ mi' }); fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S1' } }); await screen.findByRole('link', { name: 'Áo sơ mi' });
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn sản phẩm' })); expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận thay đổi' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: '  Tạm ngừng bán  ' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay đổi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đang cập nhật…' })); expect(catalog.updateAdminCatalogStatus).toHaveBeenCalledTimes(1);
    expect(catalog.updateAdminCatalogStatus).toHaveBeenCalledWith({ ids: [1], statusId: 'S2', reason: 'Tạm ngừng bán' });
    await act(async () => resolveMutation({ errCode: 0, changed: 1, skipped: 0, failed: 0, data: [{ id: 1, outcome: 'changed' }] }));
    expect(await screen.findByText(/Đã thay đổi 1 sản phẩm/)).toBeInTheDocument();
    expect(catalog.getAdminCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ statusId: 'S1', page: 1 }), expect.any(AbortSignal));
});

test('bulk failures are named and selection never leaks into another page', async () => {
    catalog.getAdminCatalog.mockResolvedValue(response([product, { ...product, id: 2, name: 'Áo hai' }]));
    catalog.updateAdminCatalogStatus.mockResolvedValue({ errCode: 0, changed: 1, skipped: 0, failed: 1, data: [{ id: 1, outcome: 'changed' }, { id: 2, outcome: 'failed', errMessage: 'Không thể lưu lịch sử' }] });
    render(<ManageProduct />); await screen.findByRole('link', { name: 'Áo hai' }); fireEvent.click(screen.getByLabelText('Chọn tất cả trên trang')); fireEvent.click(screen.getByRole('button', { name: 'Ẩn đã chọn' }));
    fireEvent.change(screen.getByLabelText('Lý do thay đổi'), { target: { value: 'Kiểm tra chất lượng' } }); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận thay đổi' }));
    expect(await screen.findByText('#2: Không thể lưu lịch sử')).toBeInTheDocument(); expect(screen.getByText(/1 thất bại/)).toBeInTheDocument();
    await screen.findByRole('link', { name: 'Áo hai' }); expect(screen.getByRole('button', { name: 'Ẩn đã chọn' })).toBeDisabled();
});

test('Excel uses the current filters, paged safe metadata and rejects excessive catalogs', async () => {
    render(<ManageProduct />); await screen.findByRole('link', { name: 'Áo sơ mi' }); fireEvent.change(screen.getByLabelText('Thương hiệu'), { target: { value: 'B1' } }); await screen.findByRole('link', { name: 'Áo sơ mi' });
    catalog.getAdminCatalog.mockResolvedValueOnce(response([{ ...product, name: '=HYPERLINK("evil")' }], { count: 1, pages: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel theo bộ lọc' }));
    await waitFor(() => expect(CommonUtils.exportExcel).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ 'Tên sản phẩm': '\'=HYPERLINK("evil")' })]), 'Danh sách sản phẩm', 'DanhSachSanPham'));
    expect(catalog.getAdminCatalog).toHaveBeenLastCalledWith(expect.objectContaining({ brandId: 'B1', pageSize: 50, page: 1 }), expect.any(AbortSignal));
    expect(CommonUtils.exportExcel.mock.calls[0][0][0]).not.toHaveProperty('image');
    catalog.getAdminCatalog.mockResolvedValue(response([product], { count: 5001, pages: 251 })); fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' })); await screen.findByText('5.001 sản phẩm');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel theo bộ lọc' })); expect(await screen.findByRole('alert')).toHaveTextContent('thu hẹp bộ lọc'); expect(CommonUtils.exportExcel).toHaveBeenCalledTimes(1);
});

test('Excel string cells cannot become spreadsheet formulas', () => {
    const row = catalogExportRows([{ ...product, name: ' +SUM(1,2)', categoryData: { value: '@cmd' }, brandData: { value: '-DACS' } }])[0];
    expect(row['Tên sản phẩm']).toBe("' +SUM(1,2)"); expect(row['Danh mục']).toBe("'@cmd"); expect(row['Thương hiệu']).toBe("'-DACS"); expect(row['Giá thấp nhất']).toBe(100000);
});

test('catalog keeps existing row and thumbnail nodes mounted during refresh and disables stale actions', async () => {
    render(<ManageProduct />);
    const link = await screen.findByRole('link', { name: 'Áo sơ mi' });
    const row = link.closest('tr');
    const image = row.querySelector('img');
    let finish;
    catalog.getAdminCatalog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'S2' } });
    expect(screen.getByRole('link', { name: 'Áo sơ mi' }).closest('tr')).toBe(row);
    expect(row.querySelector('img')).toBe(image);
    expect(row.closest('.table-responsive')).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Ẩn sản phẩm' })).toBeDisabled();
    await act(async () => finish(response([{ ...product, statusId: 'S2' }])));
    expect(row.querySelector('img')).toBe(image);
    expect(screen.getByRole('button', { name: 'Hiện sản phẩm' })).toBeEnabled();
    expect(row.closest('.table-responsive')).not.toHaveAttribute('inert');
});
