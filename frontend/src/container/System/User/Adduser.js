import React from "react";
import { useEffect, useState } from "react";
import {
    createNewUser,
    getDetailUserById,
    UpdateUserService,
} from "../../../services/userService";
import DatePicker from "react-datepicker";
import { toast } from "react-toastify";
import { useParams } from "react-router-dom";
import "react-toastify/dist/ReactToastify.css";
import { useFetchAllcode } from "../../customize/fetch";
const emptyUser = () => ({ email: '', password: '', firstName: '', lastName: '', address: '', phonenumber: '', genderId: '', roleId: '', id: '', dob: '' });
const Adduser = () => {
    const { id } = useParams();
    const isActionADD = !id;
    const [birthday, setbirthday] = useState(new Date());
    const [isChangeDate, setisChangeDate] = useState(false);
    const [inputValues, setInputValues] = useState(emptyUser);
    const [loading, setLoading] = useState(Boolean(id));
    const [loadError, setLoadError] = useState('');
    const [revision, setRevision] = useState(0);
    const [saving, setSaving] = useState(false);
    const pending = React.useRef(false);
    const { data: dataGender } = useFetchAllcode('GENDER');
    const { data: dataRole } = useFetchAllcode('ROLE');
    const defaultGender = dataGender?.[0]?.code || '';
    const defaultRole = dataRole?.find(role => role.code === 'R2')?.code || dataRole?.[0]?.code || '';
    useEffect(() => {
        let active = true;
        setInputValues(emptyUser()); setisChangeDate(false); setLoadError('');
        if (!id) { setLoading(false); setbirthday(new Date()); return () => { active = false; }; }
        setLoading(true);
        getDetailUserById(id).then(response => {
            if (!active) return;
            if (response?.errCode !== 0 || !response.data || String(response.data.id) !== String(id)) throw new Error(response?.errMessage || 'Không thể tải tài khoản.');
            const data = response.data;
            setInputValues(previous => ({ ...previous, ...Object.fromEntries(Object.keys(emptyUser()).filter(key => key !== 'password').map(key => [key, data[key] ?? ''])) }));
            const dob = Number(data.dob);
            setbirthday(dob > 0 && Number.isFinite(dob) ? new Date(dob) : null);
        }).catch(error => { if (active) setLoadError(error.message || 'Không thể tải tài khoản.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [id, revision]);
    useEffect(() => {
        if (id) return;
        setInputValues(previous => previous.genderId && previous.roleId ? previous : { ...previous, genderId: previous.genderId || defaultGender, roleId: previous.roleId || defaultRole });
    }, [id, defaultGender, defaultRole]);
    const handleOnChange = event => {
        const { name, value } = event.target;
        if (name === 'roleId' && !isActionADD) return;
        setInputValues(previous => ({ ...previous, [name]: value }));
    };
    const handleOnChangeDatePicker = date => { setbirthday(date); setisChangeDate(true); };
    const handleSaveUser = async () => {
        if (pending.current || loading || loadError || (id && String(inputValues.id) !== String(id))) return;
        pending.current = true; setSaving(true);
        try {
            const profile = { firstName: inputValues.firstName, lastName: inputValues.lastName, address: inputValues.address,
                genderId: inputValues.genderId, phonenumber: inputValues.phonenumber,
                dob: isChangeDate || isActionADD ? birthday ? birthday.getTime() : null : inputValues.dob };
            const response = isActionADD ? await createNewUser({ ...profile, email: inputValues.email, password: inputValues.password, roleId: inputValues.roleId })
                : await UpdateUserService({ ...profile, id: inputValues.id });
            if (response?.errCode !== 0) throw new Error(response?.errMessage || 'Không thể lưu tài khoản.');
            toast.success(isActionADD ? 'Thêm mới người dùng thành công' : 'Cập nhật người dùng thành công');
            if (isActionADD) { setInputValues({ ...emptyUser(), genderId: defaultGender, roleId: defaultRole }); setbirthday(null); setisChangeDate(false); }
        } catch (error) { toast.error(error.message || 'Không thể lưu tài khoản.'); }
        finally { pending.current = false; setSaving(false); }
    };
    return (
        <div className="container-fluid px-4">
            <h1 className="mt-4">Quản lý người dùng</h1>

            <div className="card mb-4">
                <div className="card-header">
                    <i className="fas fa-table me-1" />
                    {isActionADD === true
                        ? "Thêm mới người dùng"
                        : "Cập nhật thông tin người dùng"}
                </div>
                <div className="card-body">{loading && <p role="status">Đang tải tài khoản…</p>}{loadError && <p role="alert">{loadError} <button type="button" onClick={() => setRevision(value => value + 1)}>Thử lại</button></p>}
                    <form>
                        <div className="form-row">
                            <div className="form-group col-md-6">
                                <label htmlFor="inputEmail4">Email</label>
                                <input
                                    type="email"
                                    value={inputValues.email}
                                    disabled={
                                        isActionADD === true ? false : true
                                    }
                                    name="email"
                                    onChange={(event) => handleOnChange(event)}
                                    className="form-control"
                                    id="inputEmail4"
                                />
                            </div>
                            <div className="form-group col-md-6">
                                <label htmlFor="inputPassword4">Password</label>
                                <input
                                    type="password"
                                    value={inputValues.password}
                                    disabled={
                                        isActionADD === true ? false : true
                                    }
                                    name="password"
                                    onChange={(event) => handleOnChange(event)}
                                    className="form-control"
                                    id="inputPassword4"
                                />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group col-4">
                                <label htmlFor="inputEmail4">Họ</label>
                                <input
                                    type="text"
                                    value={inputValues.firstName}
                                    name="firstName"
                                    onChange={(event) => handleOnChange(event)}
                                    className="form-control"
                                    id="inputEmail4"
                                />
                            </div>
                            <div className="form-group col-4">
                                <label htmlFor="inputEmail4">Tên</label>
                                <input
                                    type="text"
                                    value={inputValues.lastName}
                                    name="lastName"
                                    onChange={(event) => handleOnChange(event)}
                                    className="form-control"
                                    id="inputEmail4"
                                />
                            </div>
                            <div className="form-group col-4">
                                <label htmlFor="inputEmail4">
                                    Số điện thoại
                                </label>
                                <input
                                    type="text"
                                    value={inputValues.phonenumber}
                                    name="phonenumber"
                                    onChange={(event) => handleOnChange(event)}
                                    className="form-control"
                                    id="inputEmail4"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="inputAddress">Địa chỉ</label>
                            <input
                                type="text"
                                value={inputValues.address}
                                name="address"
                                onChange={(event) => handleOnChange(event)}
                                className="form-control"
                                id="inputAddress"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group col-md-4">
                                <label htmlFor="inputCity">Ngày sinh</label>
                                <DatePicker
                                    className="form-control"
                                    onChange={handleOnChangeDatePicker}
                                    selected={birthday}
                                />
                            </div>
                            <div className="form-group col-md-4">
                                <label htmlFor="inputState">Giới tính</label>
                                <select
                                    value={inputValues.genderId}
                                    name="genderId"
                                    onChange={(event) => handleOnChange(event)}
                                    id="inputState"
                                    className="form-control"
                                >
                                    {dataGender &&
                                        dataGender.length > 0 &&
                                        dataGender.map((item, index) => {
                                            return (
                                                <option
                                                    key={index}
                                                    value={item.code}
                                                >
                                                    {item.value}
                                                </option>
                                            );
                                        })}
                                </select>
                            </div>
                            <div className="form-group col-md-4">
                                <label htmlFor="inputUserRole">Quyền</label>
                                <select
                                    value={inputValues.roleId}
                                    name="roleId"
                                    disabled={!isActionADD}
                                    onChange={(event) => handleOnChange(event)}
                                    id="inputUserRole"
                                    className="form-control"
                                >
                                    {dataRole &&
                                        dataRole.length > 0 &&
                                        dataRole.map((item, index) => {
                                            return (
                                                <option
                                                    key={index}
                                                    value={item.code}
                                                >
                                                    {item.value}
                                                </option>
                                            );
                                        })}
                                </select>
                                {!isActionADD && <small className="text-muted">Đổi vai trò tại trang quản lý tài khoản để ghi nhận lý do và thu hồi phiên đăng nhập cũ.</small>}
                            </div>
                        </div>

                        <button
                            type="button"
                            disabled={loading || saving || !!loadError || (Boolean(id) && String(inputValues.id) !== String(id))}
                            onClick={() => handleSaveUser()}
                            className="btn btn-primary"
                        >
                            Lưu thông tin
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
export default Adduser;
