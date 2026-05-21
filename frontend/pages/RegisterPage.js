import React, { useState } from "react";
import authApi from "../api/auth.api";
import { Link, useNavigate } from "react-router-dom";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    address: "",
    genderId: "M",
    phonenumber: "",
    dob: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await authApi.registerApi(form);
      if (res.errCode === 0) {
        setMsg("Đăng ký thành công");
        setTimeout(() => navigate("/login"), 700);
      } else {
        setMsg(res.errMessage || "Đăng ký thất bại");
      }
    } catch (error) {
      console.log(error);
      setMsg("Lỗi server");
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "30px auto" }}>
      <h2>Register</h2>
      <form onSubmit={handleRegister}>
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
        <input
          name="firstName"
          value={form.firstName}
          onChange={handleChange}
          placeholder="First name"
        />
        <br />
        <br />
        <input
          name="lastName"
          value={form.lastName}
          onChange={handleChange}
          placeholder="Last name"
        />
        <br />
        <br />
        <input
          name="address"
          value={form.address}
          onChange={handleChange}
          placeholder="Address"
        />
        <br />
        <br />
        <input
          name="phonenumber"
          value={form.phonenumber}
          onChange={handleChange}
          placeholder="Phone number"
        />
        <br />
        <br />
        <input
          name="dob"
          type="date"
          value={form.dob}
          onChange={handleChange}
        />
        <br />
        <br />
        <select name="genderId" value={form.genderId} onChange={handleChange}>
          <option value="M">Nam</option>
          <option value="F">Nữ</option>
        </select>
        <br />
        <br />
        <button type="submit">Đăng ký</button>
      </form>

      <p style={{ color: "crimson" }}>{msg}</p>
      <p>
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </div>
  );
};

export default RegisterPage;
