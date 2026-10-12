import React, { useEffect, useRef, useState } from 'react';

export function EvidenceInput({ label = 'Ảnh minh chứng', busy, onChange }) {
    const [error, setError] = useState('');
    const [image, setImage] = useState('');
    const [reading, setReading] = useState(false);
    const sequence = useRef(0);
    useEffect(() => { const current = sequence; return () => { current.current += 1; }; }, []);
    const select = event => {
        const ticket = ++sequence.current;
        const file = event.target.files?.[0];
        setImage(''); setError(''); setReading(false); onChange('', false);
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            setError('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.'); onChange('', true); event.target.value = ''; return;
        }
        setReading(true); onChange('', true);
        const reader = new FileReader();
        reader.onload = () => { if (ticket === sequence.current) { setReading(false); setImage(reader.result); onChange(reader.result, false); } };
        reader.onerror = () => { if (ticket === sequence.current) { setReading(false); setError('Không thể đọc ảnh. Vui lòng chọn lại.'); onChange('', true); } };
        reader.readAsDataURL(file);
    };
    return <div className="workflow-evidence"><label>{label}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={select} disabled={busy} /></label><small>JPEG, PNG hoặc WebP, tối đa 5 MB.</small>{reading && <p role="status">Đang đọc ảnh…</p>}{error && <p role="alert" className="text-danger">{error}</p>}{image && <img className="delivery-proof" src={image} alt={label} />}</div>;
}

export function ReasonForm({ title, label = 'Lý do', submitLabel, busy, onSubmit, onClose, evidence = false }) {
    const [reason, setReason] = useState('');
    const [proof, setProof] = useState('');
    const [invalid, setInvalid] = useState(false);
    return <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (!busy && reason.trim() && !invalid) onSubmit({ reason: reason.trim(), ...(proof ? { evidence: proof } : {}) }); }}>
        <h3 className="h5">{title}</h3><label>{label}<textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
        {evidence && <EvidenceInput busy={busy} onChange={(value, pending) => { setProof(value); setInvalid(pending); }} />}
        <div className="order-actions"><button type="submit" className="btn btn-success" disabled={busy || invalid || !reason.trim()}>{busy ? 'Đang xử lý…' : submitLabel}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Quay lại</button></div>
    </form>;
}

export function WarehouseReceiptForm({ busy, onSubmit, onClose }) {
    const [inspectionNote, setInspectionNote] = useState('');
    const [resellable, setResellable] = useState(false);
    return <form className="order-action-form" onSubmit={event => { event.preventDefault(); if (!busy && inspectionNote.trim()) onSubmit({ inspectionNote: inspectionNote.trim(), resellable }); }}>
        <h3 className="h5">Kiểm nhận hàng thực tế tại kho</h3><p>Chỉ xác nhận khi kho đã nhận đủ hàng và kiểm tra tình trạng. Hàng có thể bán lại sẽ được nhập lại tồn kho.</p>
        <label>Biên bản kiểm hàng<textarea required maxLength={1000} disabled={busy} value={inspectionNote} onChange={event => setInspectionNote(event.target.value)} /></label>
        <label className="workflow-checkbox"><input type="checkbox" disabled={busy} checked={resellable} onChange={event => setResellable(event.target.checked)} /> Toàn bộ hàng đủ điều kiện bán lại</label>
        <div className="order-actions"><button className="btn btn-success" type="submit" disabled={busy || !inspectionNote.trim()}>{busy ? 'Đang ghi nhận…' : 'Xác nhận kho đã nhận hàng'}</button><button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={onClose}>Quay lại</button></div>
    </form>;
}
