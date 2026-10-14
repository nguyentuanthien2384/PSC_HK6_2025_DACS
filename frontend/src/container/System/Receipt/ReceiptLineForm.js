import React, { useId, useRef, useState } from 'react';

const sizesOf = detail => (detail?.productDetailSize || []).filter(size => size?.id);
const detailsOf = product => (product?.productDetail || []).filter(detail => detail?.id);
export const defaultReceiptProduct = products => products.find(product => detailsOf(product).some(detail => sizesOf(detail).length)) || products[0];

export default function ReceiptLineForm({ products, suppliers = [], sizeCodes = [], withSupplier = false, disabled = false, onSave, submitLabel }) {
    const fieldId = useId();
    const [selection, setSelection] = useState({ productId: '', detailId: '', sizeId: '', supplierId: '' });
    const [quantity, setQuantity] = useState('');
    const [price, setPrice] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const savingRef = useRef(false);
    const product = products.find(item => String(item.id) === selection.productId) || defaultReceiptProduct(products);
    const details = detailsOf(product);
    const detail = details.find(item => String(item.id) === selection.detailId) || details.find(item => sizesOf(item).length) || details[0];
    const sizes = sizesOf(detail);
    const size = sizes.find(item => String(item.id) === selection.sizeId) || sizes[0];
    const supplier = suppliers.find(item => String(item.id) === selection.supplierId) || suppliers[0];
    const unavailable = !size || (withSupplier && !supplier);
    const submit = async event => {
        event.preventDefault();
        if (disabled || unavailable || savingRef.current) return;
        if (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 1000000 || price === '' || !Number.isSafeInteger(Number(price)) || Number(price) < 0) {
            setError('Số lượng phải là số nguyên từ 1 đến 1.000.000 và đơn giá là số nguyên không âm.'); return;
        }
        savingRef.current = true; setSaving(true); setError('');
        try {
            await onSave({ ...(withSupplier ? { supplierId: Number(supplier.id) } : {}), productDetailSizeId: Number(size.id), quantity: Number(quantity), price: Number(price) });
            setQuantity(''); setPrice('');
        } catch (failure) { setError(failure.message || 'Không thể lưu phiếu nhập.'); }
        finally { savingRef.current = false; setSaving(false); }
    };
    return <form onSubmit={submit} aria-label={withSupplier ? 'Tạo phiếu nhập hàng' : 'Thêm chi tiết phiếu nhập'}>
        <fieldset disabled={disabled || saving}>
            <div className="staff-tools-form-grid">
                {withSupplier && <label htmlFor={`${fieldId}-supplier`}>Nhà cung cấp<select className="form-control" id={`${fieldId}-supplier`} value={supplier?.id || ''} required onChange={event => setSelection(old => ({ ...old, supplierId: event.target.value }))}>{!suppliers.length && <option value="">Chưa có nhà cung cấp</option>}{suppliers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
                <label htmlFor={`${fieldId}-product`}>Sản phẩm<select className="form-control" id={`${fieldId}-product`} value={product?.id || ''} required onChange={event => { setSelection(old => ({ ...old, productId: event.target.value, detailId: '', sizeId: '' })); setError(''); }}>{!products.length && <option value="">Chưa có sản phẩm</option>}{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label htmlFor={`${fieldId}-detail`}>Biến thể<select className="form-control" id={`${fieldId}-detail`} value={detail?.id || ''} required disabled={!details.length} onChange={event => { setSelection(old => ({ ...old, productId: String(product.id), detailId: event.target.value, sizeId: '' })); setError(''); }}>{!details.length && <option value="">Chưa có biến thể</option>}{details.map(item => <option key={item.id} value={item.id}>{item.nameDetail}</option>)}</select></label>
                <label htmlFor={`${fieldId}-size`}>Kích thước<select className="form-control" id={`${fieldId}-size`} value={size?.id || ''} required disabled={!sizes.length} onChange={event => setSelection(old => ({ ...old, productId: String(product.id), detailId: String(detail.id), sizeId: event.target.value }))}>{!sizes.length && <option value="">Chưa có kích thước</option>}{sizes.map(item => <option key={item.id} value={item.id}>{sizeCodes.find(code => code.code === item.sizeId)?.value || item.sizeData?.value || item.sizeId || `#${item.id}`}</option>)}</select></label>
                <label htmlFor={`${fieldId}-quantity`}>Số lượng<input className="form-control" id={`${fieldId}-quantity`} type="number" inputMode="numeric" min="1" max="1000000" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
                <label htmlFor={`${fieldId}-price`}>Đơn giá (đ)<input className="form-control" id={`${fieldId}-price`} type="number" inputMode="numeric" min="0" step="1" required value={price} onChange={event => setPrice(event.target.value)} /></label>
            </div>
            {!disabled && unavailable && <p className="staff-tools-error" role="status">{withSupplier && !supplier ? 'Cần thêm nhà cung cấp trước khi tạo phiếu nhập.' : 'Sản phẩm hoặc biến thể này chưa có kích thước để nhập hàng.'}</p>}
            {error && <p className="staff-tools-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={disabled || saving || unavailable}>{saving ? 'Đang lưu…' : submitLabel}</button>
        </fieldset>
    </form>;
}
