import React from "react";
import "./css/App.css";
import Header from "./container/Header/Header";
import Footer from "./container/Footer/Footer";
import HomePage from "./container/Home/HomePage";
import ShopPage from "./container/Shop/ShopPage";
import DetailProductPage from "./container/DetailProduct/DetailProductPage";
import ShopCartPage from "./container/ShopCart/ShopCartPage";
import LoginWebPage from "./container/Login/LoginWebPage";
import OrderHomePage from "./container/Order/OrderHomePage";
import VoucherHomePage from "./container/Voucher/VoucherHomePage";
import BlogPage from "./container/Blog/BlogPage";
import DetailBlog from "./container/Blog/DetailBlog";
import VnpayPaymentPage from "./container/Order/VnpayPaymentPage";
import VnpayPaymentSuccess from "./container/Order/VnpayPaymentSuccess";
import PaymentSuccess from "./container/User/PaymentSuccess";
import UserHomePage from "./container/User/UseHomePage";
import TopMenu from "./container/Header/TopMenu";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

function App() {
    return (
        <Router>
            <Routes>
                {/* Day 1-5: Trang chủ */}
                <Route
                    path="/"
                    element={
                        <>
                            <Header />
                            <HomePage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 9: Đăng nhập / Đăng ký */}
                <Route
                    path="/login"
                    element={
                        <>
                            <Header />
                            <LoginWebPage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 14: Danh sách sản phẩm */}
                <Route
                    path="/shop"
                    element={
                        <>
                            <Header />
                            <ShopPage />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/blog"
                    element={
                        <>
                            <Header />
                            <BlogPage />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/blog-detail/:id"
                    element={
                        <>
                            <Header />
                            <DetailBlog />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/voucher"
                    element={
                        <>
                            <Header />
                            <VoucherHomePage />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/about"
                    element={
                        <>
                            <Header />
                            <HomePage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 15: Chi tiết sản phẩm */}
                <Route
                    path="/detail-product/:id"
                    element={
                        <>
                            <Header />
                            <DetailProductPage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 17: Giỏ hàng */}
                <Route
                    path="/shopcart"
                    element={
                        <>
                            <Header />
                            <ShopCartPage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 19: Đặt hàng */}
                <Route
                    path="/order/:userId"
                    element={
                        <>
                            <TopMenu />
                            <OrderHomePage />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/success"
                    element={
                        <>
                            <Header />
                            <PaymentSuccess />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/vnpay"
                    element={
                        <>
                            <TopMenu />
                            <VnpayPaymentPage />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/vnpay_return"
                    element={
                        <>
                            <TopMenu />
                            <VnpayPaymentSuccess />
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/user/*"
                    element={
                        JSON.parse(localStorage.getItem("userData")) ? (
                            <>
                                <Header />
                                <UserHomePage />
                                <Footer />
                            </>
                        ) : (
                            <Navigate to="/login" />
                        )
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
