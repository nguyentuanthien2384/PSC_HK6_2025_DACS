import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManageReceipt from './ManageReceipt';
import { getAllReceipt } from '../../../services/userService';
import CommonUtils from '../../../utils/CommonUtils';

jest.mock('react-router-dom', () => {
    global.TextEncoder = require('util').TextEncoder;
    return jest.requireActual('../../../../node_modules/react-router/dist/development/index.js');
}, { virtual: true });
jest.mock('../../../services/userService', () => ({ getAllReceipt: jest.fn() }));
jest.mock('../../../utils/CommonUtils', () => ({ exportExcel: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); getAllReceipt.mockResolvedValue({ errCode: 0, count: 7, data: [{ id: 12, createdAt: '2026-10-14T01:00:00Z', supplierData: null, userData: null }] }); });

test('missing supplier/account history stays readable and staff can create or open a receipt', async () => {
    render(<MemoryRouter><ManageReceipt /></MemoryRouter>);
    expect(await screen.findByText('Nhà cung cấp không còn tồn tại')).toBeInTheDocument();
    expect(screen.getByText('Tài khoản không còn tồn tại')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Tạo phiếu nhập' })).toHaveAttribute('href', '/system/home/add-receipt');
    expect(screen.getByRole('link', { name: 'Xem chi tiết' })).toHaveAttribute('href', '/system/home/detail-receipt/12');
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await waitFor(() => expect(getAllReceipt).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 6 })));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(CommonUtils.exportExcel).toHaveBeenCalled());
    expect(getAllReceipt).toHaveBeenLastCalledWith({});
});
