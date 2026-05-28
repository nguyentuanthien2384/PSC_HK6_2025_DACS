import React from "react";
import { useEffect, useState, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { getItemCartStart } from "../../action/ShopCartAction";
import "./Header.scss";
import TopMenu from "./TopMenu";
import socketIOClient from "socket.io-client";

const Header = (props) => {
    const [quantityMessage, setquantityMessage] = useState("");
    const [user, setUser] = useState({});
    const dispatch = useDispatch();
    let dataCart = useSelector((state) => state.shopcart.listCartItem);
    const host = process.env.REACT_APP_BACKEND_URL;
    const socketRef = useRef();
    const [id, setId] = useState();

    useEffect(() => {
        socketRef.current = socketIOClient.connect(host);
        const userData = JSON.parse(localStorage.getItem("userData"));
        setUser(userData);
        if (userData) {
            dispatch(getItemCartStart(userData.id));
            socketRef.current.on("getId", (data) => {
                setId(data);
            }); // phần này đơn giản để gán id cho mỗi phiên kết nối vào page. Mục đích chính là để phân biệt đoạn nào là của mình đang chat.
            return () => {
                socketRef.current.disconnect();
            };
        }
    }, []);
    let scrollHeader = () => {
        window.addEventListener("scroll", function () {
            var header = document.querySelector(".main_menu");
            if (header) {
                header.classList.toggle("sticky", window.scrollY > 0);
            }
        });
    };
    scrollHeader();
    const profileLink =
        user && user.id ? `/user/detail/${user.id}` : "/login";

    return (
        <header className="header_area">
            <TopMenu user={user && user} />
            <div className="main_menu">
                <div className="container">
                    <nav className="navbar navbar-expand-lg navbar-light w-100">
                        {/* Brand and toggle get grouped for better mobile display */}
                        <NavLink to="/" className="navbar-brand logo_h">
                            <img src="/resources/img/logo.png" alt="" />
                        </NavLink>
                        <button
                            className="navbar-toggler"
                            type="button"
                            data-toggle="collapse"
                            data-target="#navbarSupportedContent"
                            aria-controls="navbarSupportedContent"
                            aria-expanded="false"
                            aria-label="Toggle navigation"
                        >
                            <span className="icon-bar" />
                            <span className="icon-bar" />
                            <span className="icon-bar" />
                        </button>
                        {/* Collect the nav links, forms, and other content for toggling */}
                        <div
                            className="collapse navbar-collapse offset w-100"
                            id="navbarSupportedContent"
                        >
                            <div className="row w-100 mr-0">
                                <div className="col-lg-9 pr-0">
                                    <ul className="nav navbar-nav center_nav pull-right">
                                        <li className="nav-item">
                                            <NavLink
                                                exact
                                                to="/"
                                                className="nav-link"
                                                activeClassName="selected"
                                                activeStyle={{
                                                    color: "#71cd14",
                                                }}
                                            >
                                                Trang chủ
                                            </NavLink>
                                        </li>
                                        <li className="nav-item ">
                                            <NavLink
                                                to="/shop"
                                                className="nav-link"
                                                activeClassName="selected"
                                                activeStyle={{
                                                    color: "#71cd14",
                                                }}
                                            >
                                                Cửa hàng
                                            </NavLink>
                                        </li>
                                        <li className="nav-item ">
                                            <NavLink
                                                to="/blog"
                                                className="nav-link"
                                                activeClassName="selected"
                                                activeStyle={{
                                                    color: "#71cd14",
                                                }}
                                            >
                                                Tin tức
                                            </NavLink>
                                        </li>
                                        <li className="nav-item">
                                            <NavLink
                                                to="/voucher"
                                                className="nav-link"
                                                activeClassName="selected"
                                                activeStyle={{
                                                    color: "#71cd14",
                                                }}
                                            >
                                                Giảm giá
                                            </NavLink>
                                        </li>
                                        <li className="nav-item">
                                            <NavLink
                                                to="/about"
                                                className="nav-link"
                                                activeClassName="selected"
                                                activeStyle={{
                                                    color: "#71cd14",
                                                }}
                                            >
                                                Giới thiệu
                                            </NavLink>
                                        </li>
                                    </ul>
                                </div>
                                <div className="col-lg-3 pr-0">
                                    <ul className="nav navbar-nav navbar-right right_nav pull-right">
                                        <li className="nav-item">
                                            <Link
                                                to={"/user/messenger"}
                                                className="icons"
                                            >
                                                <i className="fa-brands fa-facebook-messenger"></i>
                                            </Link>
                                            {quantityMessage > 0 && (
                                                <span className="box-message-quantity">
                                                    {quantityMessage}
                                                </span>
                                            )}
                                        </li>
                                        <li className="nav-item">
                                            <Link
                                                to={"/shopcart"}
                                                className="icons"
                                            >
                                                <i className="ti-shopping-cart" />
                                            </Link>
                                            <span className="box-quantity-cart">
                                                {dataCart && dataCart.length}
                                            </span>
                                        </li>
                                        <li className="nav-item">
                                            <Link
                                                to={profileLink}
                                                className="icons"
                                            >
                                                <i
                                                    className="ti-user"
                                                    aria-hidden="true"
                                                />
                                            </Link>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </nav>
                </div>
            </div>
        </header>
    );
};

export default Header;
