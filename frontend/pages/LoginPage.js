import React, { useState } from "react";
import authApi from "../api/auth.api";
import { setAuth } from "../utils/token";
import { Link, useNavigate } from "react-router-dom";

const LoginPage = () => {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await authApi.loginApi(form);
      if (res.errCode === 0 && res.accessToken) {
        setAuth(res.accessToken, res.user);
        setMsg("Đăng nhập thành công");
        setTimeout(() => navigate("/"), 500);
      } else {
        setMsg(res.errMessage || "Đăng nhập thất bại");
      }
    } catch (error) {
      console.log(error);
      setMsg("Lỗi server");
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: "30px auto" }}>
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <input
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
        />
        <br />
        <br />
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Password"
        />
        <br />
        <br />
        <button type="submit">Đăng nhập</button>
      </form>

      <p style={{ color: "crimson" }}>{msg}</p>
      <p>
        Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </div>
  );
};

export default LoginPage;
