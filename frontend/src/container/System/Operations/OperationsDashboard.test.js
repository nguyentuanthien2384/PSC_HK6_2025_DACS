import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OperationsDashboard from './OperationsDashboard';
import { getOperationsDashboard } from '../../../services/adminOperationsService';

jest.mock('react-router-dom', () => ({
    Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
}), { virtual: true });
jest.mock('../../../services/adminOperationsService', () => ({ getOperationsDashboard: jest.fn() }));

const dashboard = (financialAccess = false) => ({
    errCode: 0,
    data: {
        financialAccess,
        metrics: { deliveredOrders: 12, netRevenue: 900000, grossRevenue: 1000000, refundsAgainstDeliveredOrders: 100000, refundedInPeriod: 100000, missingRecordedTotals: 0, legacyDeliveryDates: 0 },
        range: { from: '2026-09-15', to: '2026-10-14' },
        queues: { S3: 5 }, returnQueues: { REQUESTED: 2 }, dailyTrend: [], recentOrders: [],
        stock: { low: 0, out: 0, lowStock: [] },
        semantics: { revenue: 'Doanh thu trong kỳ.', queues: 'Đơn cần xử lý hiện tại.' }
    }
});
const changeRange = (from, to) => {
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: from } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: to } });
};
const submitRange = () => fireEvent.submit(screen.getByRole('form', { name: 'Chọn kỳ báo cáo' }));

beforeEach(() => { jest.clearAllMocks(); getOperationsDashboard.mockResolvedValue(dashboard()); });

test('staff dashboard keeps financial data private and fills its own KPI grid without an empty loading block', async () => {
    const { container } = render(<OperationsDashboard />);
    await screen.findByText('Đơn giao trong kỳ');
    expect(screen.queryByText('Doanh thu sau hoàn')).not.toBeInTheDocument();
    expect(screen.queryByText(/Trước hoàn:/)).not.toBeInTheDocument();
    expect(container.querySelector('.operations-kpi-grid-staff').children).toHaveLength(3);
    expect(container.querySelector('.operations-loading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Xem kỳ báo cáo' })).toBeEnabled();
});

test('admin dashboard still includes financial metrics', async () => {
    getOperationsDashboard.mockResolvedValue(dashboard(true));
    const { container } = render(<OperationsDashboard />);
    await screen.findByText('Doanh thu sau hoàn');
    expect(container.querySelector('.operations-kpi-grid').children).toHaveLength(4);
    expect(container.querySelector('.operations-kpi-grid-staff')).toBeNull();
});

test.each([
    ['', '2026-10-14', 'Vui lòng chọn ngày bắt đầu hợp lệ.', 'Từ ngày'],
    ['2026-10-14', '', 'Vui lòng chọn ngày kết thúc hợp lệ.', 'Đến ngày'],
    ['2026-10-14', '2026-10-13', 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.', 'Đến ngày'],
    ['2025-10-13', '2026-10-14', 'Vui lòng chọn kỳ báo cáo không quá 366 ngày.', 'Đến ngày']
])('invalid range %s → %s keeps the current report and focuses the field to correct', async (from, to, message, label) => {
    render(<OperationsDashboard />); await screen.findByText('Đơn giao trong kỳ');
    changeRange(from, to); submitRange();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText(label)).toHaveFocus();
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(getOperationsDashboard).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Đơn giao trong kỳ')).toBeInTheDocument();
    changeRange('2026-10-14', '2026-10-14');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test.each([['2026-10-14', '2026-10-14'], ['2025-10-14', '2026-10-14']])('inclusive valid range %s → %s loads the requested report', async (from, to) => {
    render(<OperationsDashboard />); await screen.findByText('Đơn giao trong kỳ');
    changeRange(from, to); submitRange();
    await waitFor(() => expect(getOperationsDashboard).toHaveBeenLastCalledWith({ from, to }, expect.any(AbortSignal)));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('loading a new period keeps the visible report and prevents duplicate requests', async () => {
    let finish;
    getOperationsDashboard.mockResolvedValueOnce(dashboard()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<OperationsDashboard />);
    const metric = await screen.findByText('Đơn giao trong kỳ');
    changeRange('2026-10-14', '2026-10-14'); submitRange();
    await waitFor(() => expect(getOperationsDashboard).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Xem kỳ báo cáo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Làm mới dữ liệu' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Đang cập nhật tổng quan vận hành…');
    expect(screen.getByText('Đơn giao trong kỳ')).toBe(metric);
    submitRange();
    expect(getOperationsDashboard).toHaveBeenCalledTimes(2);
    await act(async () => finish(dashboard()));
    expect(screen.getByRole('button', { name: 'Xem kỳ báo cáo' })).toBeEnabled();
});
