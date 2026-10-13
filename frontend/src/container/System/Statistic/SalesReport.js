import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import moment from 'moment';
import { getStatisticOverturn, getStatisticProfit } from '../../../services/userService';
import CommonUtils from '../../../utils/CommonUtils';
import 'react-datepicker/dist/react-datepicker.css';

export default function SalesReport({ profit = false }) {
    const [type, setType] = useState('month');
    const [dateTime, setDateTime] = useState(new Date());
    const [dateRange, setDateRange] = useState([null, null]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [exporting, setExporting] = useState(false);
    const request = useRef(0);
    const title = profit ? 'Lợi nhuận ước tính' : 'Doanh thu';
    const load = useCallback(async (query) => {
        const current = ++request.current;
        setLoading(true); setLoaded(false); setError(''); setRows([]);
        try {
            const result = await (profit ? getStatisticProfit : getStatisticOverturn)(query);
            if (request.current !== current) return;
            if (!result || result.errCode !== 0) throw new Error(result?.errMessage || 'Không tải được thống kê.');
            setRows(result.data || []); setLoaded(true);
        } catch (failure) {
            if (request.current === current) setError(failure.message || 'Không tải được thống kê.');
        } finally {
            if (request.current === current) setLoading(false);
        }
    }, [profit]);
    useEffect(() => {
        const requests = request;
        load({ type: 'month', oneDate: new Date() });
        return () => { requests.current++; };
    }, [load]);
    function filter(event) {
        event.preventDefault();
        const [start, end] = dateRange;
        if ((type === 'day' && (!start || !end || start > end)) || (type !== 'day' && !dateTime)) {
            request.current++; setLoading(false); setRows([]); setLoaded(false);
            setError('Vui lòng chọn đầy đủ khoảng thời gian hợp lệ.'); return;
        }
        load({ type, oneDate: type === 'day' ? start : dateTime, twoDate: type === 'day' ? end : undefined });
    }
    async function exportRows() {
        setExporting(true);
        try {
            const data = rows.map(row => ({
                'Mã đơn': row.id, 'Ngày đặt': moment(row.createdAt).utcOffset(420).format('DD/MM/YYYY HH:mm:ss'),
                'Ngày giao xong': moment(row.deliveredAt || row.updatedAt).utcOffset(420).format('DD/MM/YYYY HH:mm:ss'),
                'Vận chuyển': row.typeShipData?.type || '', 'Voucher': row.voucherData?.codeVoucher || '',
                'Thanh toán': Number(row.isPaymentOnlien) === 0 ? 'COD' : 'Online', 'Tổng tiền': row.totalpriceProduct,
                'Đã hoàn tiền': row.refundAmount || 0, 'Doanh thu sau hoàn': row.netRevenue ?? row.totalpriceProduct,
                ...(profit ? { 'Giá vốn ước tính': row.importPrice, 'Lợi nhuận ước tính': row.profitPrice } : {}),
            }));
            await CommonUtils.exportExcel(data, title, profit ? 'Profit' : 'Turnover');
        } catch { setError('Không xuất được Excel. Vui lòng thử lại.'); }
        finally { setExporting(false); }
    }
    const total = rows.reduce((sum, row) => sum + Number(profit ? row.profitPrice : row.netRevenue ?? row.totalpriceProduct), 0);
    return <div className="container-fluid px-4">
        <h1 className="mt-4">Thống kê {title.toLowerCase()}</h1>
        <p>Ghi nhận đơn đã giao theo ngày giao xong (giờ Việt Nam), trừ tiền hoàn đã xác nhận. {profit && 'Giá vốn là bình quân gia quyền các lần nhập trước khi giao; chưa trừ chi phí vận hành và chi phí giao hàng thực tế.'}</p>
        <div className="card mb-4"><div className="card-body">
            <form onSubmit={filter} className="d-flex flex-wrap align-items-end gap-3 mb-3">
                <label>Loại thống kê<select aria-label="Loại thống kê" className="form-control" value={type} onChange={event => setType(event.target.value)}>
                    <option value="day">Khoảng ngày</option><option value="month">Tháng</option><option value="year">Năm</option>
                </select></label>
                <div><label htmlFor="report-date">{type === 'day' ? 'Khoảng ngày' : type === 'month' ? 'Chọn tháng' : 'Chọn năm'}</label><br />
                    {type === 'day' ? <DatePicker id="report-date" className="form-control" selectsRange startDate={dateRange[0]} endDate={dateRange[1]} onChange={setDateRange} isClearable dateFormat="dd/MM/yyyy" /> :
                        <DatePicker id="report-date" className="form-control" selected={dateTime} onChange={setDateTime} showMonthYearPicker={type === 'month'} showYearPicker={type === 'year'} dateFormat={type === 'month' ? 'MM/yyyy' : 'yyyy'} />}
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Đang tải…' : 'Lọc'}</button>
                <button className="btn btn-success" type="button" disabled={loading || exporting || !loaded || !rows.length} onClick={exportRows}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button>
            </form>
            {error && <p role="alert" className="text-danger">{error}</p>}
            {loading && <p role="status">Đang tải thống kê…</p>}
            {loaded && !rows.length && <p role="status">Không có đơn đã giao trong khoảng thời gian này.</p>}
            <div className="table-responsive"><table className="table table-bordered">
                <thead><tr><th>Mã đơn</th><th>Ngày đặt</th><th>Ngày giao xong</th><th>Vận chuyển</th><th>Voucher</th><th>Thanh toán</th><th>Tổng tiền</th><th>Đã hoàn tiền</th><th>Doanh thu sau hoàn</th>{profit && <><th>Giá vốn ước tính</th><th>Lợi nhuận ước tính</th></>}<th>Thao tác</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.id}>
                    <td>#{row.id}</td><td>{moment(row.createdAt).utcOffset(420).format('DD/MM/YYYY HH:mm')}</td><td>{moment(row.deliveredAt || row.updatedAt).utcOffset(420).format('DD/MM/YYYY HH:mm')}</td>
                    <td>{row.typeShipData?.type || '—'}</td><td>{row.voucherData?.codeVoucher || '—'}</td><td>{Number(row.isPaymentOnlien) === 0 ? 'COD' : 'Online'}</td>
                    <td>{CommonUtils.formatter.format(row.totalpriceProduct)}</td><td>{CommonUtils.formatter.format(row.refundAmount || 0)}</td><td>{CommonUtils.formatter.format(row.netRevenue ?? row.totalpriceProduct)}</td>{profit && <><td>{CommonUtils.formatter.format(row.importPrice)}</td><td>{CommonUtils.formatter.format(row.profitPrice)}</td></>}
                    <td><Link to={`/system/home/order-detail/${row.id}`}>Xem chi tiết</Link></td>
                </tr>)}</tbody>
            </table></div>
            {loaded && <p className="fs-4">Tổng {title.toLowerCase()}: <strong>{CommonUtils.formatter.format(total)}</strong></p>}
        </div></div>
    </div>;
}
