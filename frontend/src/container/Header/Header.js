import { getUser } from "../../utils/token";
import React from "react";
import { useEffect, useState, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { getItemCartStart } from "../../action/ShopCartAction";
import "./Header.scss";
import TopMenu from "./TopMenu";
import NotificationsBell from "../../component/Notifications/NotificationsBell";

const Header = (props) => {
    const [user, setUser] = useState({});
    const [menuExpanded, setMenuExpanded] = useState(false);
    const dispatch = useDispatch();
    let dataCart = useSelector((state) => state.shopcart.listCartItem);
    const menuRef = useRef(null);

    useEffect(() => {
        const userData = getUser();
        setUser(userData);
        if (userData) {
            dispatch(getItemCartStart(userData.id));
            return;
        }
        dispatch(getItemCartStart(null));
    }, [dispatch]);
    useEffect(() => {
        let frame = null;
        let scrolled;
        const updateShadow = () => {
            frame = null;
            const next = window.scrollY > 0;
            if (next !== scrolled) menuRef.current?.classList.toggle("sticky", next);
            scrolled = next;
        };
        const onScroll = () => {
            if (frame === null) frame = window.requestAnimationFrame(updateShadow);
        };
        updateShadow();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (frame !== null) window.cancelAnimationFrame(frame);
        };
    }, []);
    const profileLink =
        user && user.id ? `/user/detail/${user.id}` : "/login";

    return (
        <header className="header_area">
            <TopMenu user={user && user} />
            <div className="main_menu" ref={menuRef}>
                <div className="container">
                    <nav className="navbar navbar-expand-lg navbar-light w-100">
                        {/* Brand and toggle get grouped for better mobile display */}
                        <NavLink to="/" className="navbar-brand logo_h">
                            <img src="/resources/img/logo.png" alt="" />
                        </NavLink>
                        <button
                            className="navbar-toggler"
                            type="button"
                            onClick={() => setMenuExpanded((value) => !value)}
                            aria-controls="navbarSupportedContent"
                            aria-expanded={menuExpanded}
                            aria-label="Toggle navigation"
                        >
                            <span className="icon-bar" />
                            <span className="icon-bar" />
                            <span className="icon-bar" />
                        </button>
                        {/* Collect the nav links, forms, and other content for toggling */}
                        <div
                            className={`collapse navbar-collapse offset w-100${menuExpanded ? ' show' : ''}`}
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
                                        {user?.roleId === "R3" && <li className="nav-item"><NavLink to="/shipper" className="nav-link">Giao hàng</NavLink></li>}
                                    </ul>
                                </div>
                                <div className="col-lg-3 pr-0">
                                    <ul className="nav navbar-nav navbar-right right_nav pull-right">
                                        {user?.id && <li className="nav-item"><NotificationsBell /></li>}
                                        <li className="nav-item">
                                            <Link
                                                to={"/user/messenger"}
                                                className="icons"
                                            >
                                                <i className="fa-brands fa-facebook-messenger"></i>
                                            </Link>
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
