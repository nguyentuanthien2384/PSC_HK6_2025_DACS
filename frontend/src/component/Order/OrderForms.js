import React, { useEffect, useRef, useState } from 'react';
import { rateShipper } from '../../services/shippingService';
import { formatOrderDate, shipperName } from '../../utils/orders';
import './OrderWorkflow.scss';

export function CancelOrderForm({ busy, onSubmit, onClose }) {
    const [reason, setReason] = useState('');
    return <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (reason.trim()) onSubmit(reason.trim()); }}>
        <label>Lý do hủy đơn<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
        <div className="order-actions"><button type="submit" className="btn btn-danger" disabled={busy || !reason.trim()}>{busy ? 'Đang hủy…' : 'Xác nhận hủy đơn'}</button><button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Giữ đơn hàng</button></div>
    </form>;
}

export function ShipperRating({ order, onRated, allowSubmit = false }) {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(null);
    const currentOrderId = useRef(order.id);
    currentOrderId.current = order.id;
    const existing = order.shipperRating || (submitted?.orderId === order.id ? submitted : null);
    useEffect(() => { setRating(0); setComment(''); setError(''); setBusy(false); }, [order.id]);

    const submit = async (event) => {
        event.preventDefault();
        if (!rating || busy) return;
        setBusy(true); setError('');
        const submittedOrderId = order.id;
        try {
            const response = await rateShipper({ orderId: order.id, rating, comment: comment.trim() });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể gửi đánh giá.');
            if (currentOrderId.current !== submittedOrderId) return;
            setSubmitted({ ...(response.data || { rating, comment: comment.trim() }), orderId: submittedOrderId });
            if (onRated) onRated();
        } catch (failure) { if (currentOrderId.current === submittedOrderId) setError(failure.message); }
        finally { if (currentOrderId.current === submittedOrderId) setBusy(false); }
    };

    if (existing) return <section className="order-rating"><h3>Đánh giá người giao hàng</h3><p aria-label={`${existing.rating} trên 5 sao`}>{'★'.repeat(Number(existing.rating))}{'☆'.repeat(5 - Number(existing.rating))} · {existing.rating}/5</p>{existing.comment && <p>{existing.comment}</p>}{existing.createdAt && <small>{formatOrderDate(existing.createdAt)}</small>}<p className="text-success">Đã gửi đánh giá.</p></section>;
    if (!allowSubmit) return null;
    return <form className="order-rating" onSubmit={submit}>
        <h3>Đánh giá {shipperName(order.shipperData)}</h3>
        <fieldset disabled={busy}><legend>Bạn hài lòng với người giao hàng như thế nào?</legend><div className="rating-stars">
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={value <= rating ? 'selected' : ''}><input type="radio" name={`shipper-rating-${order.id}`} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} sao`} /><span aria-hidden="true">★</span></label>)}
        </div><label>Nhận xét (không bắt buộc)<textarea maxLength={1000} value={comment} onChange={event => setComment(event.target.value)} placeholder="Thái độ, thời gian giao hàng…" /></label></fieldset>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <button className="btn btn-success" type="submit" disabled={!rating || busy}>{busy ? 'Đang gửi…' : 'Gửi đánh giá'}</button>
    </form>;
}
