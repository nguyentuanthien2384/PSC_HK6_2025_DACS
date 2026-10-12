import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import ReactPaginate from 'react-paginate';
import { getAllOrder } from '../../../services/userService';
import { PAGINATION } from '../../../utils/constant';
import CommonUtils from '../../../utils/CommonUtils';
import { formatOrderDate, formatOrderMoney, orderTotals, ORDER_STATUSES, shipperName } from '../../../utils/orders';

export default function ManageOrder() {
    const [orders, setOrders] = useState([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(0);
    const [status, setStatus] = useState('ALL');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [exporting, setExporting] = useState(false);
    const request = useRef(0);
    const loadOrders = useCallback(async () => {
        const current = ++request.current;
        setLoading(true); setError('');
        try {
            const response = await getAllOrder({ limit: PAGINATION.pagerow, offset: page * PAGINATION.pagerow, statusId: status });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải đơn hàng.');
            if (current === request.current) { setOrders(response.data || []); setCount(Number(response.count) || 0); }
        } catch (failure) { if (current === request.current) setError(failure.message); }
        finally { if (current === request.current) setLoading(false); }
    }, [page, status]);
    useEffect(() => { const requests = request; loadOrders(); return () => { requests.current += 1; }; }, [loadOrders]);

    const exportOrders = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const rows = []; let offset = 0; let total = Infinity;
            while (offset < total) {
                const response = await getAllOrder({ limit: 100, offset, statusId: status });
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xuất đơn hàng.');
                const data = response.data || [];
                rows.push(...data); total = Number(response.count) || 0; offset += data.length;
                if (!data.length) break;
            }
            await CommonUtils.exportExcel(rows.map(order => ({
                'Mã đơn': order.id, 'Người nhận': order.addressUser?.shipName || '', 'Điện thoại': order.addressUser?.shipPhonenumber || '',
                'Địa chỉ': order.addressUser?.shipAdress || '', 'Ngày đặt': formatOrderDate(order.createdAt), 'Trạng thái': order.statusOrderData?.value || ORDER_STATUSES[order.statusId],
                'Người giao hàng': order.shipperData ? shipperName(order.shipperData) : '', 'Tổng thanh toán': orderTotals(order).totalPrice,
                'Thanh toán': Number(order.isPaymentOnlien) === 1 ? 'Trực tuyến' : 'Tiền mặt', 'Đánh giá shipper': order.shipperRating?.rating || '',
            })), 'Danh sách đơn hàng', 'ListOrder');
        } catch (failure) { toast.error(failure.message); }
        finally { setExporting(false); }
    };

    return <main className="container-fluid px-4">
        <h1 className="mt-4">Quản lý đơn đặt hàng</h1>
        <div className="card mb-4"><div className="card-body">
            <div className="order-filters"><label>Trạng thái đơn hàng<select className="form-select" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="ALL">Tất cả</option>{Object.entries(ORDER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" onClick={exportOrders} disabled={exporting} className="btn btn-success">{exporting ? 'Đang xuất…' : 'Xuất Excel'}</button></div>
            {loading && <p role="status">Đang tải đơn hàng…</p>}
            {error && <div role="alert"><p>{error}</p><button className="btn btn-outline-success" type="button" onClick={loadOrders}>Thử lại</button></div>}
            {!loading && !error && <div className="table-responsive"><table className="table table-bordered"><thead><tr><th>Mã đơn</th><th>Người nhận</th><th>Ngày đặt</th><th>Tổng thanh toán</th><th>Hình thức</th><th>Trạng thái</th><th>Người giao hàng</th><th>Đánh giá</th><th>Thao tác</th></tr></thead><tbody>
                {!orders.length && <tr><td colSpan={9}>Chưa có đơn hàng ở trạng thái này.</td></tr>}
                {orders.map(order => <tr key={order.id}><td>#{order.id}</td><td>{order.addressUser?.shipName || order.userData?.email || '—'}<br />{order.addressUser?.shipPhonenumber || order.userData?.phonenumber || ''}</td><td>{formatOrderDate(order.createdAt)}</td><td>{formatOrderMoney(orderTotals(order).totalPrice)}</td><td>{Number(order.isPaymentOnlien) === 1 ? 'Trực tuyến' : 'Tiền mặt'}</td><td>{order.statusOrderData?.value || ORDER_STATUSES[order.statusId]}</td><td>{order.shipperData ? shipperName(order.shipperData) : 'Chưa phân công'}</td><td>{order.shipperRating ? `${order.shipperRating.rating}/5` : '—'}</td><td><Link to={`/system/home/order-detail/${order.id}`}>Xem chi tiết</Link></td></tr>)}
            </tbody></table></div>}
        </div></div>
        {count > PAGINATION.pagerow && <ReactPaginate previousLabel="Quay lại" nextLabel="Tiếp" breakLabel="…" pageCount={Math.ceil(count / PAGINATION.pagerow)} forcePage={page} containerClassName="pagination justify-content-center" pageClassName="page-item" pageLinkClassName="page-link" previousLinkClassName="page-link" nextLinkClassName="page-link" activeClassName="active" onPageChange={({ selected }) => setPage(selected)} />}
    </main>;
}
