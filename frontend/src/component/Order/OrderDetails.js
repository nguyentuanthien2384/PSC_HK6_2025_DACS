import React from 'react';
import { formatOrderDate, formatOrderMoney, orderTotals, ORDER_STATUSES, paymentLabel, shipperName } from '../../utils/orders';
import './OrderWorkflow.scss';

export function OrderTimeline({ order }) {
    const legacyEvents = [
        { label: 'Đặt hàng', time: order.createdAt },
        { label: 'Người giao hàng nhận đơn', time: order.assignedAt },
        { label: 'Giao hàng thành công', time: order.deliveredAt },
        { label: 'Hủy đơn hàng', time: order.cancelledAt },
    ].filter(event => event.time);
    const events = Array.isArray(order.events) && order.events.length ? [...order.events]
        .sort((a, b) => new Date(a.createdAt || a.time) - new Date(b.createdAt || b.time))
        .map(event => ({ id: event.id, label: event.title || event.label || ORDER_STATUSES[event.statusId] || event.eventType || event.type, detail: event.message || event.reason || event.note, time: event.createdAt || event.time })) : legacyEvents;
    return events.length ? <ol className="order-timeline" aria-label="Lịch sử đơn hàng">
        {events.map((event, index) => <li key={event.id || index}><strong>{event.label}</strong>{event.detail && <p>{event.detail}</p>}<time>{formatOrderDate(event.time)}</time></li>)}
    </ol> : null;
}

export function ShipperInfo({ order }) {
    const shipper = order.shipperData;
    return <section className="order-section">
        <h3>Người giao hàng</h3>
        {shipper ? <>
            <p><strong>{shipperName(shipper)}</strong>{shipper.phonenumber && <> · <a href={`tel:${shipper.phonenumber}`}>{shipper.phonenumber}</a></>}</p>
            {Number(shipper.ratingCount) > 0 && <p>{Number(shipper.ratingAverage).toFixed(1)}/5 · {shipper.ratingCount} đánh giá</p>}
        </> : <p>{order.statusId === 'S7' ? 'Đơn hàng đã hủy.' : 'Chưa phân công người giao hàng.'}</p>}
    </section>;
}

export default function OrderDetails({ order, compact = false }) {
    const totals = orderTotals(order);
    const address = order.addressUser;
    return <div className="order-details">
        {!compact && <div className="order-heading"><h2>Đơn hàng #{order.id}</h2><span>{order.statusOrderData?.value || ORDER_STATUSES[order.statusId] || order.statusId}</span></div>}
        <section className="order-section">
            <h3>Địa chỉ nhận hàng</h3>
            {address ? <><p><strong>{address.shipName}</strong>{address.shipPhonenumber && <> · <a href={`tel:${address.shipPhonenumber}`}>{address.shipPhonenumber}</a></>}</p><p>{address.shipAdress}</p></> : <p>Chưa có thông tin địa chỉ.</p>}
            {order.note && <p>Lời nhắn: {order.note}</p>}
        </section>
        <ShipperInfo order={order} />
        <section className="order-section">
            <h3>Sản phẩm</h3>
            {(order.orderDetail || []).map((line, index) => <div className="order-product" key={line.id || index}>
                {line.productImage?.[0]?.image && <img src={line.productImage[0].image} alt={line.product?.name || 'Sản phẩm'} />}
                <div><strong>{line.product?.name || 'Sản phẩm đã mua'}</strong><p>{[line.productDetail?.nameDetail, line.productDetailSize?.sizeData?.value].filter(Boolean).join(' · ')}</p><p>Số lượng: {line.quantity}</p></div>
                <span>{formatOrderMoney(Number(line.realPrice ?? line.productDetail?.discountPrice ?? 0) * Number(line.quantity || 0))}</span>
            </div>)}
        </section>
        <dl className="order-totals">
            <div><dt>Tiền hàng</dt><dd>{formatOrderMoney(totals.subtotal)}</dd></div>
            <div><dt>Giảm giá{order.voucherData?.codeVoucher && ` (${order.voucherData.codeVoucher})`}</dt><dd>−{formatOrderMoney(totals.discountAmount)}</dd></div>
            <div><dt>Phí vận chuyển{order.typeShipData?.type && ` · ${order.typeShipData.type}`}</dt><dd>{formatOrderMoney(totals.shippingFee)}</dd></div>
            <div className="order-total"><dt>Tổng thanh toán</dt><dd>{formatOrderMoney(totals.totalPrice)}</dd></div>
        </dl>
        <p>Thanh toán: {paymentLabel(order)}</p>
        {order.lastDeliveryFailureReason && <p role="status">Giao không thành công: {order.lastDeliveryFailureReason}</p>}
        {Number(order.deliveryAttempts) > 0 && <p>Số lần giao thất bại: {order.deliveryAttempts}</p>}
        {order.cancellationReason && <p className="order-cancellation">Lý do hủy: {order.cancellationReason}</p>}
        {order.image && <section className="order-section"><h3>Ảnh giao hàng</h3><a href={order.image} target="_blank" rel="noreferrer"><img className="delivery-proof" src={order.image} alt={`Ảnh giao hàng đơn ${order.id}`} /></a></section>}
        <OrderTimeline order={order} />
    </div>;
}
