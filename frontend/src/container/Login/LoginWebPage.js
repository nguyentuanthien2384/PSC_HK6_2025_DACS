import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { createNewUser, handleLoginService } from "../../services/userService";
import { setAuth } from "../../utils/token";
import "./LoginWebPage.css";

export default function LoginWebPage() {
    const [register, setRegister] = useState(false);
    const [busy, setBusy] = useState(false);
    const [values, setValues] = useState({ email: "", password: "", lastName: "", phonenumber: "", passwordCon: "" });
    const [params] = useSearchParams();
    const onChange = ({ target: { name, value } }) => setValues((previous) => ({ ...previous, [name]: value }));

    const submit = async (event) => {
        event.preventDefault();
        if (busy) return;
        if (register && values.password !== values.passwordCon) {
            toast.error("Mật khẩu xác nhận chưa trùng khớp");
            return;
        }
        setBusy(true);
        try {
            const credentials = { email: values.email.trim(), password: values.password };
            if (register) {
                const created = await createNewUser({ ...credentials, lastName: values.lastName.trim(), phonenumber: values.phonenumber.trim() });
                if (created.errCode !== 0) throw new Error(created.errMessage || "Không thể tạo tài khoản");
                toast.success("Tạo tài khoản thành công");
            }
            const result = await handleLoginService(credentials);
            if (result.errCode !== 0 || !result.accessToken || !result.user) {
                throw new Error(result.errMessage || "Đăng nhập không thành công");
            }
            setAuth(result.accessToken, result.user);
            const redirect = params.get("redirect");
            const safeRedirect = redirect?.startsWith("/") && !redirect.startsWith("//") && !redirect.includes("\\");
            window.location.href = safeRedirect ? redirect : ["R1", "R4"].includes(result.user.roleId) ? "/system/home" : "/";
        } catch (error) {
            toast.error(error.message);
        } finally {
            setBusy(false);
        }
    };

    return <div className="box-login"><div className="login-container"><section id="formHolder"><div className="row">
        <div className="col-sm-6 brand"><a href="/" className="logo">MR <span>.</span></a><div className="heading"><h2>Easier</h2><p>Sự lựa chọn của bạn</p></div></div>
        <div className="col-sm-6 form"><div className="login form-peice"><form className="login-form" onSubmit={submit}>
            <h3>{register ? "Tạo tài khoản" : "Đăng nhập"}</h3>
            {register && <div className="form-group"><label htmlFor="lastName">Họ và tên</label><input id="lastName" name="lastName" value={values.lastName} onChange={onChange} autoComplete="name" required /></div>}
            <div className="form-group"><label htmlFor="loginemail">Địa chỉ email</label><input id="loginemail" name="email" type="email" value={values.email} onChange={onChange} autoComplete="email" required /></div>
            {register && <div className="form-group"><label htmlFor="phonenumber">Số điện thoại</label><input id="phonenumber" name="phonenumber" type="tel" value={values.phonenumber} onChange={onChange} autoComplete="tel" /></div>}
            <div className="form-group"><label htmlFor="loginPassword">Mật khẩu</label><input id="loginPassword" name="password" type="password" value={values.password} onChange={onChange} autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : undefined} required /></div>
            {register && <div className="form-group"><label htmlFor="passwordCon">Xác nhận mật khẩu</label><input id="passwordCon" name="passwordCon" type="password" value={values.passwordCon} onChange={onChange} autoComplete="new-password" minLength={8} required /></div>}
            <div className="CTA"><input type="submit" disabled={busy} value={busy ? "Đang xử lý…" : register ? "Đăng ký" : "Đăng nhập"} />
                <button type="button" className="switch-account" disabled={busy} onClick={() => setRegister(!register)}>{register ? "Tôi đã có tài khoản" : "Tạo tài khoản mới"}</button>
            </div>
        </form></div></div>
    </div></section></div></div>;
}
