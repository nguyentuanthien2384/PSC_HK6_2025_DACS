import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getShippingProviders, bookCarrierShipment, syncCarrierShipment, cancelCarrierShipment } from '../../services/orderOperationsService';
import { formatOrderDate, formatOrderMoney } from '../../utils/orders';

const shipmentStatuses = { CREATING: 'Đang tạo vận đơn', UNCERTAIN: 'Chưa xác định kết quả, cần đồng bộ', CREATED: 'Đã tạo vận đơn', PICKING: 'Đang lấy hàng', PICKED: 'Đã lấy hàng', SHIPPING: 'Đang vận chuyển', DELIVERING: 'Đang giao', DELIVERED: 'Đã giao', FAILED: 'Giao thất bại', RETURNING: 'Đang hoàn về', RETURNED: 'Đã hoàn về', CANCELLED: 'Đã hủy vận đơn', pending: 'Chờ lấy hàng', ready_to_pick: 'Chờ lấy hàng', delivering: 'Đang giao', delivered: 'Đã giao', delivery_fail: 'Giao thất bại', return: 'Đang hoàn về', returned: 'Đã hoàn về' };

export default function CarrierShipment({ order, admin = false, onUpdated }) {
    const [providers, setProviders] = useState([]);
    const [provider, setProvider] = useState('');
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');
    const [values, setValues] = useState({ weight: '', length: '', width: '', height: '', province: '', district: '', ward: '', provinceId: '', districtId: '', wardCode: '', serviceTypeId: '2', note: '' });
    const currentOrder = useRef(order.id);
    currentOrder.current = order.id;
    const canBook = admin && order.statusId === 'S4' && !order.shipperId && !order.shipment;
    const loadProviders = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const response = await getShippingProviders();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải cấu hình vận chuyển.');
            setProviders((response.data || []).filter(item => item.id !== 'internal'));
        } catch (failure) { setError(failure.message); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { if (canBook) loadProviders(); }, [canBook, loadProviders]);
    const selected = providers.find(item => item.id === provider);
    const validParcel = ['weight', 'length', 'width', 'height'].every(key => Number.isInteger(Number(values[key])) && Number(values[key]) > 0);
    const validAddress = values.province.trim() && values.ward.trim() && (provider !== 'ghn' || Number(values.serviceTypeId) > 0);
    const update = event => setValues(previous => ({ ...previous, [event.target.name]: event.target.value }));
    const perform = async operation => {
        if (busy) return;
        const id = order.id;
        setBusy(true); setError('');
        try {
            const response = await operation();
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xử lý vận đơn.');
            if (currentOrder.current === id) { setCancelling(false); await onUpdated?.(); }
        } catch (failure) { if (currentOrder.current === id) setError(failure.message); }
        finally { if (currentOrder.current === id) setBusy(false); }
    };
    if (!canBook && !order.shipment) return null;
    const shipment = order.shipment;
    return <section className="order-section carrier-shipment" aria-label="Vận chuyển qua đối tác">
        <h3>Vận chuyển qua đối tác</h3>
        {shipment && <><p><strong>{shipment.provider?.toUpperCase()} · {shipment.environment === 'production' ? 'Vận đơn thật' : 'Sandbox / kiểm thử'}</strong></p>
            <p>Mã vận đơn: {shipment.trackingCode || 'Chưa có mã vận đơn'}</p><p>Trạng thái đối tác: {shipmentStatuses[shipment.status] || shipment.status || 'Chưa xác định'}</p>
            {shipment.fee != null && <p>Phí từ đối tác: {formatOrderMoney(shipment.fee)}</p>}{shipment.expectedDeliveryAt && <p>Dự kiến giao: {formatOrderDate(shipment.expectedDeliveryAt)}</p>}{shipment.lastSyncedAt && <p>Đồng bộ lần cuối: {formatOrderDate(shipment.lastSyncedAt)}</p>}
            {shipment.lastError && <p role="alert" className="text-danger">{shipment.lastError}</p>}
            {admin && <button type="button" className="btn btn-outline-success" disabled={busy} onClick={() => perform(() => syncCarrierShipment(order.id))}>{busy ? 'Đang đối soát…' : 'Đồng bộ trạng thái từ hãng'}</button>}
            {admin && order.statusId === 'S4' && Number(order.isPaymentOnlien) === 0 && <button type="button" className="btn btn-outline-danger ms-2" disabled={busy} onClick={() => setCancelling(true)}>Hủy vận đơn đối tác</button>}
            {cancelling && <div className="order-action-form"><p>Xác nhận yêu cầu hãng hủy vận đơn #{shipment.trackingCode}? Đơn chỉ được hủy khi hãng xác nhận hủy thành công.</p><div className="order-actions"><button type="button" className="btn btn-danger" disabled={busy} onClick={() => perform(() => cancelCarrierShipment(order.id))}>{busy ? 'Đang yêu cầu…' : 'Gửi yêu cầu hủy vận đơn'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => setCancelling(false)}>Giữ vận đơn</button></div></div>}
        </>}
        {canBook && <><p>Bạn có thể phân công đội shipper bên dưới hoặc tạo vận đơn tại GHN / GHTK sau khi kết nối tài khoản của cửa hàng.</p>
            {loading && <p role="status">Đang kiểm tra kết nối vận chuyển…</p>}
            {!loading && !providers.length && <button type="button" className="btn btn-outline-secondary" onClick={loadProviders}>Tải lại cấu hình vận chuyển</button>}
            {!!providers.length && <form className="order-action-form" onSubmit={event => {
                event.preventDefault();
                if (!selected?.configured || !validParcel || !validAddress || busy) return;
                const destination = { province: values.province.trim(), ward: values.ward.trim(), ...(values.district.trim() ? { district: values.district.trim() } : {}) };
                perform(() => bookCarrierShipment({ orderId: order.id, provider, parcel: Object.fromEntries(['weight', 'length', 'width', 'height'].map(key => [key, Number(values[key])])), destination, ...(provider === 'ghn' ? { serviceTypeId: Number(values.serviceTypeId) } : {}), note: values.note.trim() }));
            }}>
                <label>Hãng vận chuyển<select className="form-select" required value={provider} disabled={busy} onChange={event => setProvider(event.target.value)}><option value="">Chọn GHN hoặc GHTK</option>{providers.map(item => <option key={item.id} value={item.id}>{item.name} · {item.environment === 'production' ? 'Production' : 'Sandbox'}{!item.configured ? ' · Chưa kết nối' : ''}</option>)}</select></label>
                {selected && <><p className={selected.configured ? '' : 'text-danger'} role="status">{selected.configured ? `Đã kết nối ${selected.name} (${selected.environment === 'production' ? 'production' : 'sandbox'}).` : `${selected.name} chưa được cấu hình tài khoản / khóa API cho ${selected.environment === 'production' ? 'production' : 'sandbox'}. Chưa thể tạo vận đơn.`}</p>
                    <fieldset disabled={busy || !selected.configured}><legend className="h6">Kiện hàng thực tế</legend><div className="workflow-field-grid">{[['weight', 'Khối lượng (gram)'], ['length', 'Dài (cm)'], ['width', 'Rộng (cm)'], ['height', 'Cao (cm)']].map(([key, label]) => <label key={key}>{label}<input className="form-control" name={key} type="number" min="1" step="1" required value={values[key]} onChange={update} /></label>)}</div>
                        <legend className="h6 mt-3">Địa chỉ theo danh mục của hãng</legend><p>Thông tin người nhận và tiền COD được lấy từ đơn hàng. Nhập đúng địa danh hoặc mã địa bàn của hãng vận chuyển.</p>
                        <div className="workflow-field-grid">{[['province', 'Tỉnh/thành phố'], ['ward', 'Phường/xã'], ['district', 'Quận/huyện (nếu có)'], ...(provider === 'ghn' ? [['serviceTypeId', 'Mã loại dịch vụ GHN']] : [])].map(([key, label]) => <label key={key}>{label}<input className="form-control" name={key} required={key !== 'district'} type={key === 'serviceTypeId' ? 'number' : 'text'} min="1" maxLength={100} value={values[key]} onChange={update} /></label>)}</div>
                        <label>Ghi chú cho hãng<textarea name="note" maxLength={1000} value={values.note} onChange={update} /></label>
                    </fieldset><button type="submit" className="btn btn-success" disabled={busy || !selected.configured || !validParcel || !validAddress}>{busy ? 'Đang tạo vận đơn…' : 'Tạo vận đơn với hãng'}</button>
                </>}
            </form>}
        </>}
        {error && <p role="alert" className="text-danger">{error}</p>}
    </section>;
}
