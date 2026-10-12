import React, { useEffect, useState } from 'react';
import { getDetailAddressUserByIdService } from '../../services/userService';
import { Modal, ModalFooter, ModalBody, Button } from 'reactstrap';
import { toast } from 'react-toastify';

const empty = { shipName: '', shipAdress: '', shipEmail: '', shipPhonenumber: '', isDefault: false, isActionUpdate: false };
const AddressUsersModal = props => {
    const [values, setValues] = useState(empty);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!props.isOpenModal) return;
        let active = true;
        setValues(empty);
        setLoadError('');
        setLoading(!!props.addressUserId);
        if (props.addressUserId) {
            getDetailAddressUserByIdService(props.addressUserId).then(response => {
                if (!active) return;
                if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải địa chỉ.');
                setValues({ ...empty, ...response.data, isActionUpdate: true });
            }).catch(error => { if (active) { setLoadError(error.message); toast.error(error.message); } })
                .finally(() => { if (active) setLoading(false); });
        }
        return () => { active = false; };
    }, [props.isOpenModal, props.addressUserId]);
    const change = event => {
        const { name, value, type, checked } = event.target;
        setValues(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
    };
    const save = async () => {
        if (saving || loading || loadError) return;
        if (!values.shipName.trim() || !values.shipAdress.trim() || !values.shipPhonenumber.trim() || !values.shipEmail.trim()) {
            toast.error('Vui lòng nhập đầy đủ tên, số điện thoại, email và địa chỉ nhận hàng.'); return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.shipEmail)) { toast.error('Email nhận hàng không hợp lệ.'); return; }
        setSaving(true);
        try {
            const success = await props.sendDataFromModalAddress({ ...values, id: props.addressUserId });
            if (success !== false) setValues(empty);
        } catch (error) { toast.error(error.message); }
        finally { setSaving(false); }
    };
    return <Modal isOpen={props.isOpenModal} className="booking-modal-container" size="md" centered>
        <div className="modal-header">
            <h5 className="modal-title">{props.addressUserId ? 'Chỉnh sửa địa chỉ' : 'Địa chỉ mới'}</h5>
            <button disabled={saving} onClick={props.closeModaAddressUser} type="button" className="btn btn-time" aria-label="Đóng">X</button>
        </div>
        <ModalBody>
            {loading && <p role="status">Đang tải địa chỉ...</p>}
            {loadError && <p role="alert">{loadError}</p>}
            <div className="row">
                {[['shipName', 'Họ và tên'], ['shipPhonenumber', 'Số điện thoại'], ['shipEmail', 'Email'], ['shipAdress', 'Địa chỉ cụ thể']].map(([name, label]) =>
                    <div className="col-12 form-group" key={name}>
                        <label htmlFor={`shipping-${name}`}>{label}</label>
                        <input id={`shipping-${name}`} maxLength={255} disabled={loading || saving || !!loadError} value={values[name]} name={name} onChange={change}
                            type={name === 'shipEmail' ? 'email' : name === 'shipPhonenumber' ? 'tel' : 'text'} className="form-control" />
                    </div>)}
                {!props.addressUserId && <label className="form-check">
                    <input className="form-check-input" type="checkbox" name="isDefault" checked={values.isDefault} disabled={saving} onChange={change} />
                    Đặt làm địa chỉ mặc định
                </label>}
            </div>
        </ModalBody>
        <ModalFooter>
            <Button color="primary" disabled={saving || loading || !!loadError} onClick={save}>{saving ? 'Đang lưu...' : 'Lưu thông tin'}</Button>
            <Button disabled={saving} onClick={props.closeModaAddressUser}>Hủy</Button>
        </ModalFooter>
    </Modal>;
};
export default AddressUsersModal;
