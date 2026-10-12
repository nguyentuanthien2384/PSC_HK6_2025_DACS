import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getAllAddressUserByUserIdService, createNewAddressUserrService, deleteAddressUserService, editAddressUserService } from '../../services/userService';
import { setDefaultAddressUserService } from '../../services/addressService';
import AddressUsersModal from '../ShopCart/AdressUserModal';
import './AddressUser.scss';

function AddressUser(props) {
    const [dataAddressUser, setDataAddressUser] = useState([]);
    const [addressUserId, setAddressUserId] = useState('');
    const [isOpenModalAddressUser, setOpenModal] = useState(false);
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        const response = await getAllAddressUserByUserIdService(props.id);
        if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể tải địa chỉ.');
        setDataAddressUser(response.data || []);
    }, [props.id]);
    useEffect(() => {
        if (props.id) load().catch(error => toast.error(error.message));
    }, [props.id, load]);

    const saveAddress = async data => {
        try {
            const values = { shipName: data.shipName, shipAdress: data.shipAdress, shipEmail: data.shipEmail,
                shipPhonenumber: data.shipPhonenumber, userId: props.id, isDefault: data.isDefault };
            const response = await (data.isActionUpdate ? editAddressUserService({ ...values, id: data.id }) : createNewAddressUserrService(values));
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể lưu địa chỉ.');
            await load();
            toast.success(data.isActionUpdate ? 'Cập nhật địa chỉ thành công.' : 'Thêm địa chỉ thành công.');
            setOpenModal(false); setAddressUserId('');
            return true;
        } catch (error) { toast.error(error.message); return false; }
    };
    const removeAddress = async id => {
        if (busy) return;
        setBusy(true);
        try {
            const response = await deleteAddressUserService({ data: { id } });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể xóa địa chỉ.');
            await load(); toast.success('Xóa địa chỉ thành công.');
        } catch (error) { toast.error(error.message); }
        finally { setBusy(false); }
    };
    const makeDefault = async id => {
        if (busy) return;
        setBusy(true);
        try {
            const response = await setDefaultAddressUserService(id);
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể đặt địa chỉ mặc định.');
            await load(); toast.success('Đã đặt địa chỉ mặc định.');
        } catch (error) { toast.error(error.message); }
        finally { setBusy(false); }
    };

    return <div className="container rounded bg-white mt-5 mb-5">
        <div className="box-heading d-flex justify-content-between">
            <span>Địa chỉ của tôi</span>
            <button type="button" disabled={busy} className="btn btn-primary" onClick={() => { setAddressUserId(''); setOpenModal(true); }}>Thêm địa chỉ mới</button>
        </div>
        {!dataAddressUser.length && <p>Chưa có địa chỉ nhận hàng. Địa chỉ đầu tiên sẽ được đặt làm mặc định.</p>}
        {dataAddressUser.map(item => <div key={item.id} className="box-address-user">
            <div className="content-left">
                <p><strong>{item.shipName}</strong>{item.isDefault && <span className="badge bg-success ms-2">Mặc định</span>}</p>
                <p>{item.shipPhonenumber} · {item.shipEmail}</p>
                <p>{item.shipAdress}</p>
            </div>
            <div className="content-right d-flex flex-wrap align-items-start gap-2">
                {!item.isDefault && <button type="button" disabled={busy} className="btn btn-outline-primary btn-sm" onClick={() => makeDefault(item.id)}>Đặt làm mặc định</button>}
                <button type="button" disabled={busy} className="btn btn-outline-secondary btn-sm" onClick={() => { setAddressUserId(item.id); setOpenModal(true); }}>Sửa</button>
                <button type="button" disabled={busy} className="btn btn-outline-danger btn-sm" onClick={() => removeAddress(item.id)}>Xóa</button>
            </div>
        </div>)}
        <AddressUsersModal addressUserId={addressUserId} sendDataFromModalAddress={saveAddress}
            isOpenModal={isOpenModalAddressUser} closeModaAddressUser={() => { setOpenModal(false); setAddressUserId(''); }} />
    </div>;
}
export default AddressUser;

