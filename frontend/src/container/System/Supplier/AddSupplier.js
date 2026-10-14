import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { createNewSupplierService, getDetailSupplierByIdService, updateSupplierService } from '../../../services/userService';
import '../StaffTools.scss';

const emptyValues = { name: '', address: '', phonenumber: '', email: '' };
export default function AddSupplier() {
    const { id } = useParams();
    const routeId = id || 'new';
    const routeRef = useRef(routeId); routeRef.current = routeId;
    const savingRef = useRef(false);
    const [record, setRecord] = useState({ routeId: '', loading: !!id, error: '', values: emptyValues });
    const [version, setVersion] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        setSaveError('');
        setRecord({ routeId, loading: !!id, error: '', values: emptyValues });
        if (id) getDetailSupplierByIdService(id, { signal: controller.signal }).then(response => {
            if (controller.signal.aborted) return;
            if (response?.errCode !== 0 || !response.data) throw new Error(response?.errMessage || 'Không tìm thấy nhà cung cấp.');
            const values = Object.fromEntries(Object.keys(emptyValues).map(key => [key, response.data[key] || '']));
            setRecord({ routeId, loading: false, error: '', values });
        }).catch(failure => {
            if (!controller.signal.aborted) setRecord({ routeId, loading: false, error: failure.message || 'Không thể tải nhà cung cấp.', values: emptyValues });
        });
        return () => controller.abort();
    }, [id, routeId, version]);
    const loading = record.routeId !== routeId || record.loading;
    const error = record.routeId === routeId ? record.error : '';
    const values = record.routeId === routeId ? record.values : emptyValues;
    const update = event => { const { name, value } = event.target; setRecord(old => ({ ...old, values: { ...old.values, [name]: value } })); };
    const submit = async event => {
        event.preventDefault();
        if (loading || error || savingRef.current) return;
        const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]));
        if (Object.values(data).some(value => !value)) { setSaveError('Vui lòng điền đầy đủ thông tin nhà cung cấp.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { setSaveError('Địa chỉ email không hợp lệ.'); return; }
        savingRef.current = true; setSaving(true); setSaveError('');
        try {
            const response = await (id ? updateSupplierService({ ...data, id }) : createNewSupplierService(data));
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể lưu nhà cung cấp.');
            toast.success(id ? 'Cập nhật nhà cung cấp thành công' : 'Thêm nhà cung cấp thành công');
            if (!id && routeRef.current === routeId) setRecord(old => ({ ...old, values: emptyValues }));
        } catch (failure) { if (routeRef.current === routeId) setSaveError(failure.message || 'Không thể lưu nhà cung cấp.'); }
        finally { savingRef.current = false; setSaving(false); }
    };
    return <div className="staff-tools">
        <Link to="/system/home/list-supplier" className="staff-tools-back">← Danh sách nhà cung cấp</Link>
        <div className="staff-tools-header"><div><h1>{id ? 'Chỉnh sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</h1><p>Cập nhật thông tin liên hệ dùng trong quá trình nhập hàng.</p></div></div>
        <section className="staff-tools-panel" aria-busy={loading}>
            {loading && <p role="status">Đang tải nhà cung cấp…</p>}
            {error && <p role="alert" className="staff-tools-error">{error} <button type="button" className="btn btn-outline-secondary" onClick={() => setVersion(old => old + 1)}>Thử lại</button></p>}
            <form aria-label="Thông tin nhà cung cấp" onSubmit={submit}><fieldset disabled={loading || !!error || saving}>
                <div className="staff-tools-form-grid">
                    <label htmlFor="supplier-name">Tên nhà cung cấp<input className="form-control" id="supplier-name" name="name" type="text" required maxLength={255} value={values.name} onChange={update} /></label>
                    <label htmlFor="supplier-email">Địa chỉ email<input className="form-control" id="supplier-email" name="email" type="email" required maxLength={255} value={values.email} onChange={update} /></label>
                    <label htmlFor="supplier-phone">Số điện thoại<input className="form-control" id="supplier-phone" name="phonenumber" type="tel" required maxLength={30} value={values.phonenumber} onChange={update} /></label>
                    <label htmlFor="supplier-address">Địa chỉ<input className="form-control" id="supplier-address" name="address" type="text" required maxLength={255} value={values.address} onChange={update} /></label>
                </div>
                {saveError && <p role="alert" className="staff-tools-error">{saveError}</p>}
                <button type="submit" className="btn btn-primary" disabled={loading || !!error || saving}>{saving ? 'Đang lưu…' : 'Lưu thông tin'}</button>
            </fieldset></form>
        </section>
    </div>;
}
