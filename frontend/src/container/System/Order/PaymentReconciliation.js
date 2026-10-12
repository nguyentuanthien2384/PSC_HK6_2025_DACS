import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPaymentReconciliation, reconcilePayment, getPaymentRefunds, retryPaymentRefund, refundPaymentSession } from '../../../services/paymentOperationsService';
import { formatOrderDate, formatOrderMoney } from '../../../utils/orders';
import { ReasonForm } from '../../../component/Order/WorkflowForms';
import '../../../component/Order/OrderWorkflow.scss';

const statuses = { PENDING: 'Đang chờ xác minh', FAILED: 'Thất bại', EXPIRED: 'Hết hạn', COMPLETED: 'Đã xác nhận thành công', REVIEW_REQUIRED: 'Cần kiểm tra thủ công', PROCESSING: 'Đang xử lý', NOT_CONFIGURED: 'Chưa cấu hình cổng', REQUESTED: 'Đã gửi yêu cầu', REFUNDED: 'Đã hoàn tiền' };

export default function PaymentReconciliation() {
    const [tab, setTab] = useState('payments');
    const [sessions, setSessions] = useState([]);
    const [refunds, setRefunds] = useState([]);
    const [readiness, setReadiness] = useState({});
    const [count, setCount] = useState({ payments: 0, refunds: 0 });
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [resultMessage, setResultMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [refundSessionId, setRefundSessionId] = useState(null);
    const sequence = useRef(0);
    const load = useCallback(async () => {
        const ticket = ++sequence.current;
        setLoading(true); setError('');
        try {
            const response = await (tab === 'payments' ? getPaymentReconciliation({ limit: 50, offset: page * 50 }) : getPaymentRefunds({ limit: 50, offset: page * 50 }));
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải đối soát thanh toán.');
            if (ticket === sequence.current) {
                if (tab === 'payments') { setSessions(response.data || []); setReadiness(response.readiness || {}); } else setRefunds(response.data || []);
                setCount(previous => ({ ...previous, [tab]: Number(response.count) || 0 }));
            }
        } catch (failure) { if (ticket === sequence.current) setError(failure.message); }
        finally { if (ticket === sequence.current) setLoading(false); }
    }, [tab, page]);
    useEffect(() => { const requests = sequence; load(); return () => { requests.current += 1; }; }, [load]);
    const perform = async operation => {
        if (busy) return;
        setBusy(true); setActionError(''); setResultMessage('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể đối soát giao dịch.');
            setResultMessage(`Kết quả từ cổng thanh toán: ${statuses[response.status] || response.status || response.errMessage || 'Đã gửi yêu cầu xác minh'}.`);
            setRefundSessionId(null);
            await load();
        } catch (failure) { setActionError(failure.message); }
        finally { setBusy(false); }
    };
    return <div className="container-fluid order-workflow">
        <div className="order-heading"><h1 className="h3">Đối soát thanh toán / hoàn tiền</h1><button type="button" className="btn btn-outline-success" disabled={busy || loading} onClick={load}>Làm mới</button></div>
        <p>Trạng thái thanh toán và hoàn tiền chỉ được cập nhật từ phản hồi xác minh của cổng thanh toán. Các giao dịch cần kiểm tra vẫn được giữ để xử lý.</p>
        {!!Object.keys(readiness).length && <div className="shipping-summary">{Object.entries(readiness).map(([provider, config]) => <div key={provider}><strong className="h5">{provider.toUpperCase()}</strong><p>{config.mode === 'production' || config.mode === 'live' ? 'Production' : 'Sandbox / kiểm thử'} · {config.configured ? 'Đã cấu hình' : 'Chưa có khóa merchant'}</p>{provider === 'paypal' && !config.webhookConfigured && <small>Chưa cấu hình webhook nhận thông báo.</small>}{provider === 'vnpay' && !config.ipnUrlConfigured && <small>Chưa cấu hình địa chỉ IPN công khai.</small>}</div>)}</div>}
        <div className="shipping-tabs" role="tablist" aria-label="Loại đối soát">{[['payments', 'Giao dịch thanh toán'], ['refunds', 'Khoản hoàn tiền']].map(([key, label]) => <button type="button" role="tab" aria-selected={tab === key} className="btn btn-outline-success" disabled={busy} key={key} onClick={() => { setTab(key); setPage(0); setActionError(''); setResultMessage(''); }}>{label}</button>)}</div>
        {loading && <p role="status" className="order-status-message">Đang tải giao dịch…</p>}{error && <div role="alert" className="order-status-message"><p>{error}</p><button type="button" className="btn btn-outline-secondary" onClick={load}>Thử lại</button></div>}{actionError && <p role="alert" className="text-danger">{actionError}</p>}{resultMessage && <p role="status">{resultMessage}</p>}
        {!loading && !error && !(tab === 'payments' ? sessions : refunds).length && <p className="order-status-message">Chưa có {tab === 'payments' ? 'giao dịch thanh toán' : 'khoản hoàn tiền'}.</p>}
        {!loading && !error && (tab === 'payments' ? sessions : refunds).map(item => <article className="order-card" key={item.id} aria-label={`${tab === 'payments' ? 'Giao dịch' : 'Khoản hoàn'} ${item.id}`}>
            <div className="order-heading"><h2>{tab === 'payments' ? 'Giao dịch' : 'Khoản hoàn'} #{item.id} · {item.provider?.toUpperCase()}</h2><span>{statuses[item.status] || item.status}</span></div>
            <p>Số tiền: <strong>{formatOrderMoney(tab === 'payments' ? item.totalPrice : item.amountVnd)}</strong>{item.providerAmount != null && <> · Cổng: {item.providerAmount} {item.currency}</>}</p>
            <p>Ngày tạo: {formatOrderDate(item.createdAt)}{item.lastCheckedAt && <> · Đối soát gần nhất: {formatOrderDate(item.lastCheckedAt)}</>}</p>
            {item.providerPaymentId && <p>Mã thanh toán: {item.providerPaymentId}</p>}{item.providerRefundId && <p>Mã hoàn tại cổng: {item.providerRefundId}</p>}{item.paidAt && <p>Cổng ghi nhận thanh toán: {formatOrderDate(item.paidAt)}</p>}{item.completedAt && <p>Hoàn tiền xác nhận: {formatOrderDate(item.completedAt)}</p>}
            {item.reviewReason && <p>Cần xử lý: {item.reviewReason}</p>}{item.lastError && <p className="text-danger">Lỗi đối soát: {item.lastError}</p>}
            {tab === 'payments' && item.status === 'REVIEW_REQUIRED' && <p>Cổng đã gửi bằng chứng cần kiểm tra. Chưa xác nhận đơn hàng được hoàn tất.</p>}
            <div className="order-actions">{item.orderId && <Link className="btn btn-outline-secondary" to={`/system/home/order-detail/${item.orderId}`}>Xem đơn #{item.orderId}</Link>}
                {tab === 'payments' && ['PENDING', 'REVIEW_REQUIRED', 'FAILED', 'EXPIRED'].includes(item.status) && <button type="button" className="btn btn-success" disabled={busy} onClick={() => perform(() => reconcilePayment(item.id))}>{busy ? 'Đang đối soát…' : 'Xác minh với cổng thanh toán'}</button>}
                {tab === 'refunds' && item.status !== 'COMPLETED' && <button type="button" className="btn btn-success" disabled={busy} onClick={() => perform(() => retryPaymentRefund(item.id))}>{busy ? 'Đang xử lý…' : 'Đối soát / thử lại hoàn tiền'}</button>}
                {tab === 'payments' && item.status === 'REVIEW_REQUIRED' && item.paidAt && !item.orderId && <button type="button" className="btn btn-outline-danger" disabled={busy} onClick={() => setRefundSessionId(item.id)}>Hoàn tiền phiên chưa tạo đơn</button>}
            </div>
            {refundSessionId === item.id && <ReasonForm title="Hoàn tiền giao dịch đã thu nhưng chưa tạo đơn" label="Lý do hoàn tiền phiên" submitLabel="Gửi yêu cầu hoàn tiền phiên" busy={busy} onClose={() => setRefundSessionId(null)} onSubmit={({ reason }) => perform(() => refundPaymentSession({ sessionId: item.id, reason }))} />}
        </article>)}
        {count[tab] > 50 && <nav className="order-actions" aria-label="Phân trang đối soát"><button type="button" className="btn btn-outline-secondary" disabled={!page || loading || busy} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page + 1} / {Math.ceil(count[tab] / 50)}</span><button type="button" className="btn btn-outline-secondary" disabled={(page + 1) * 50 >= count[tab] || loading || busy} onClick={() => setPage(page + 1)}>Trang sau</button></nav>}
    </div>;
}
