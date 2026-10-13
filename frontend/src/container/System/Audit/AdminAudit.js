import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminAudit } from '../../../services/adminAccountService';
import { ORDER_STATUSES, RETURN_STATUSES, formatOrderMoney } from '../../../utils/orders';
import './AdminAudit.scss';

const PAGE_SIZE = 25;
const initialFilters = { entityType: 'ALL', keyword: '', from: '', to: '' };
const entities = { ORDER: 'Đơn hàng', USER: 'Tài khoản', PRODUCT: 'Sản phẩm', INVENTORY: 'Tồn kho' };
const roles = { R1: 'Quản trị viên', R2: 'Khách hàng', R3: 'Shipper', R4: 'Nhân viên vận hành' };
const actions = { USER_CREATED: 'Tạo tài khoản', USER_ROLE_CHANGED: 'Đổi vai trò', USER_DISABLED: 'Khóa tài khoản', USER_RESTORED: 'Mở khóa tài khoản', PRODUCT_HIDE: 'Ẩn sản phẩm', PRODUCT_RESTORE: 'Mở bán sản phẩm', STOCK_COUNT: 'Kiểm kê tồn kho' };
const fields = { statusId: 'Trạng thái', roleId: 'Vai trò', onHand: 'Tồn kho', reserved: 'Đang giữ thanh toán', quantity: 'Điều chỉnh số lượng', shipperId: 'Mã shipper', fromStatus: 'Trạng thái trước', toStatus: 'Trạng thái sau', status: 'Trạng thái xử lý', returnId: 'Mã yêu cầu trả hàng', returnRequestId: 'Mã yêu cầu trả hàng', refundId: 'Mã hoàn tiền', refundAmount: 'Tiền hoàn', amount: 'Số tiền', deliveryProvider: 'Đơn vị giao hàng', carrier: 'Đơn vị giao hàng', reason: 'Lý do', resellable: 'Có thể bán lại' };
const dateText = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

function valueLabel(key, value, entityType) {
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'object') return '—';
    if (typeof value === 'boolean') return value ? 'Có' : 'Không';
    if (key === 'roleId') return roles[value] || String(value);
    if (['amount', 'refundAmount'].includes(key)) return formatOrderMoney(value);
    if (['carrier', 'deliveryProvider'].includes(key)) return ({ internal: 'Shipper cửa hàng', ghn: 'GHN', ghtk: 'GHTK' })[value] || String(value);
    if (['status', 'statusId', 'fromStatus', 'toStatus'].includes(key)) {
        if (entityType === 'PRODUCT' && ['S1', 'S2'].includes(value)) return value === 'S1' ? 'Đang bán' : 'Đã ẩn';
        return ({ S1: 'Đang hoạt động', S2: 'Bị khóa', ...ORDER_STATUSES, ...RETURN_STATUSES, PAID: 'Đã thanh toán', PENDING: 'Chờ xử lý', COMPLETED: 'Đã hoàn tất', FAILED: 'Thất bại' })[value] || String(value);
    }
    return String(value);
}

export function auditChanges(entry) {
    const before = entry.before && typeof entry.before === 'object' && !Array.isArray(entry.before) ? entry.before : {};
    const after = entry.after && typeof entry.after === 'object' && !Array.isArray(entry.after) ? entry.after : {};
    return Object.keys(fields).filter(key => (Object.prototype.hasOwnProperty.call(before, key) || Object.prototype.hasOwnProperty.call(after, key)) &&
        (before[key] == null || typeof before[key] !== 'object') && (after[key] == null || typeof after[key] !== 'object')).map(key => ({ label: fields[key], before: valueLabel(key, before[key], entry.entityType), after: valueLabel(key, after[key], entry.entityType) }));
}

function EntityLink({ entry }) {
    const target = ({ ORDER: `/system/home/order-detail/${entry.entityId}`, USER: `/system/home/edit-user/${entry.entityId}`, PRODUCT: `/system/home/list-product-detail/${entry.entityId}`, INVENTORY: '/system/home/inventory' })[entry.entityType];
    const label = `${entities[entry.entityType] || 'Đối tượng'} #${entry.entityId}`;
    return target && /^\d+$/.test(String(entry.entityId)) ? <Link to={target}>{label}</Link> : <span>{label}</span>;
}

export default function AdminAudit() {
    const [draft, setDraft] = useState(initialFilters);
    const [filters, setFilters] = useState(initialFilters);
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterError, setFilterError] = useState('');
    const [revision, setRevision] = useState(0);
    const requestRef = useRef(0);
    useEffect(() => {
        const controller = new AbortController(), request = ++requestRef.current;
        setLoading(true); setError(''); setRows([]);
        getAdminAudit({ ...filters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, controller.signal)
            .then(result => {
                if (controller.signal.aborted || request !== requestRef.current) return;
                if (result?.errCode !== 0) throw new Error(result?.errMessage || 'Không thể tải nhật ký.');
                const total = Number(result.count) || 0;
                if (page > 1 && (page - 1) * PAGE_SIZE >= total) { setPage(Math.max(1, Math.ceil(total / PAGE_SIZE))); return; }
                setRows(result.data || []); setCount(total);
            })
            .catch(cause => { if (!controller.signal.aborted && request === requestRef.current) setError(cause.message || 'Không thể tải nhật ký.'); })
            .finally(() => { if (!controller.signal.aborted && request === requestRef.current) setLoading(false); });
        return () => controller.abort();
    }, [filters, page, revision]);
    const changeDraft = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    return <div className="admin-audit container-fluid px-4">
        <header className="admin-audit__header"><p className="admin-audit__eyebrow">KIỂM SOÁT VẬN HÀNH</p><h1>Nhật ký quản trị</h1><p>Theo dõi người thực hiện, thời gian và nội dung thay đổi của đơn hàng, tài khoản, sản phẩm và tồn kho.</p></header>
        <form className="admin-audit__filters" onSubmit={event => { event.preventDefault(); if (draft.from && draft.to && draft.from > draft.to) { setFilterError('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.'); return; } setFilterError(''); setPage(1); setFilters({ ...draft, keyword: draft.keyword.trim() }); }}>
            <label>Nội dung, mã hoặc người thực hiện<input value={draft.keyword} maxLength={100} onChange={event => changeDraft('keyword', event.target.value)} /></label>
            <label>Đối tượng<select value={draft.entityType} onChange={event => changeDraft('entityType', event.target.value)}><option value="ALL">Tất cả đối tượng</option>{Object.entries(entities).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Từ ngày<input type="date" value={draft.from} onChange={event => changeDraft('from', event.target.value)} /></label><label>Đến ngày<input type="date" value={draft.to} onChange={event => changeDraft('to', event.target.value)} /></label>
            <div className="admin-audit__filter-actions"><button type="submit" className="btn btn-primary">Áp dụng bộ lọc</button><button type="button" className="btn btn-outline-secondary" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setFilterError(''); setPage(1); }}>Xóa bộ lọc</button></div>
        </form>
        {filterError && <div className="alert alert-warning" role="alert">{filterError}</div>}
        {error && <div className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-danger" onClick={() => setRevision(previous => previous + 1)}>Thử lại</button></div>}
        <section className="admin-audit__list" aria-label="Danh sách nhật ký" aria-busy={loading}>
            <div className="admin-audit__toolbar"><strong>{loading ? 'Đang tải nhật ký…' : `${count.toLocaleString('vi-VN')} sự kiện`}</strong><span>Thời gian Việt Nam · Mới nhất trước</span><button className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => setRevision(previous => previous + 1)}>Làm mới</button></div>
            <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Thời gian / người thực hiện</th><th>Đối tượng / hành động</th><th>Nội dung</th><th>Trước → Sau</th></tr></thead><tbody>
                {loading ? <tr><td colSpan={4} className="admin-audit__empty">Đang tải dữ liệu…</td></tr> : rows.length ? rows.map(entry => { const changes = auditChanges(entry); return <tr key={entry.id}><td><time dateTime={entry.createdAt}>{dateText(entry.createdAt)}</time><strong>{entry.actorName || `Tài khoản #${entry.actorId}`}</strong><small>{roles[entry.actorRole] || 'Nhân sự cửa hàng'} · #{entry.actorId}</small></td><td><EntityLink entry={entry} /><small>{actions[entry.action] || (entry.entityType === 'ORDER' ? 'Xử lý đơn hàng' : 'Cập nhật thông tin')}</small></td><td className="admin-audit__summary">{entry.summary || '—'}</td><td>{changes.length ? <dl className="admin-audit__changes">{changes.map((item, index) => <div key={index}><dt>{item.label}</dt><dd><span>{item.before}</span><span aria-label="chuyển thành">→</span><strong>{item.after}</strong></dd></div>)}</dl> : <span className="text-muted">Chi tiết tại đối tượng liên quan</span>}</td></tr>; }) : <tr><td colSpan={4} className="admin-audit__empty">{error ? 'Dữ liệu chưa được tải.' : 'Chưa có sự kiện phù hợp bộ lọc.'}</td></tr>}
            </tbody></table></div>
            <div className="admin-audit__pagination"><span>Trang {page}/{pages} · {PAGE_SIZE} sự kiện mỗi trang</span><div><button className="btn btn-outline-secondary" disabled={loading || page <= 1} onClick={() => setPage(previous => previous - 1)}>Trang trước</button><button className="btn btn-outline-secondary" disabled={loading || page >= pages} onClick={() => setPage(previous => previous + 1)}>Trang sau</button></div></div>
        </section>
        <p className="admin-audit__note">Nhật ký được ghi từ khi chức năng này được triển khai. Các sự kiện được giữ lại để đối chiếu lịch sử vận hành.</p>
    </div>;
}
