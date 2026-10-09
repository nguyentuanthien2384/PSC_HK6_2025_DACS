import React from "react";
import { NavLink } from "react-router-dom";
import "./Header.scss";
import { clearAuth, getUser } from "../../utils/token";
const TopMenu = (props) => {
  const user = props.user || getUser();
  let handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  let name =
    user && user.id
      ? `${
          user.firstName || ""
        } ${user.lastName || ""}`
      : "";
  const profileLink =
    user && user.id ? `/user/detail/${user.id}` : "/login";
  return (
    <div className="top_menu">
      <div className="container">
        <div className="row">
          <div className="col-lg-7">
            <div className="float-left">
              <p>Điện thoại: 0359568182 </p>
              <p>email: admin@st.phenikaa-uni.edu.vn</p>
            </div>
          </div>
          <div className="col-lg-5">
            <div className="float-right">
              <ul className="right_side">
                <li>
                  {user && user.id ? (
                    <NavLink exact to={profileLink}>
                      {name}
                    </NavLink>
                  ) : (
                    <a href="/login">Đăng nhập</a>
                  )}
                </li>
                <li style={{ cursor: "pointer" }}>
                  {user && user.id ? (
                    <a onClick={() => handleLogout()}>Đăng xuất</a>
                  ) : (
                    <a href="/login">Đăng ký</a>
                  )}
                </li>
                <li>
                  <a>VI</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopMenu;
