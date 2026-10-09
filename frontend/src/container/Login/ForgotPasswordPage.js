import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { sendForgotPasswordEmail, resetPassword } from "../../services/userService";

export default function ForgotPasswordPage({ reset = false }) {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const token = params.get("token");
  const id = params.get("userId") || params.get("id");
  const invalidLink = reset && (!token || !id);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setMessage("");
    if (reset && password !== confirmation) { setError("Mật khẩu xác nhận chưa trùng khớp"); return; }
    setBusy(true);
    try {
      const result = reset ? await resetPassword({ id, token, password }) : await sendForgotPasswordEmail({ email: email.trim() });
      if (result.errCode !== 0) throw new Error(result.errMessage || "Không thể xử lý yêu cầu");
      setMessage(reset ? "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới." : result.message);
      setDone(true);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className="container py-5" style={{ maxWidth: 520 }}>
    <h2>{reset ? "Đặt lại mật khẩu" : "Quên mật khẩu"}</h2>
    {invalidLink ? <p role="alert">Đường dẫn đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu một email mới.</p> :
      <form onSubmit={submit}>
        {!reset && <div className="form-group"><label htmlFor="reset-email">Email tài khoản</label><input className="form-control" id="reset-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></div>}
        {reset && <><div className="form-group"><label htmlFor="new-password">Mật khẩu mới</label><input className="form-control" id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} /></div>
          <div className="form-group"><label htmlFor="confirm-password">Xác nhận mật khẩu</label><input className="form-control" id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div></>}
        <button className="btn btn-primary my-3" disabled={busy || (reset && done)}>{busy ? "Đang xử lý…" : reset ? "Lưu mật khẩu mới" : "Gửi hướng dẫn qua email"}</button>
      </form>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    <Link to="/login">Quay lại đăng nhập</Link>
    {invalidLink && <p><Link to="/forgot-password">Yêu cầu đặt lại mật khẩu</Link></p>}
  </section>;
}