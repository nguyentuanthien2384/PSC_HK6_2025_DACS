import React from "react";
import "./css/App.css";
import Header from "./container/Header/Header";
import Footer from "./container/Footer/Footer";
import HomePage from "./container/Home/HomePage";
import ShopPage from "./container/Shop/ShopPage";
import DetailProductPage from "./container/DetailProduct/DetailProductPage";
import ShopCartPage from "./container/ShopCart/ShopCartPage";
import LoginWebPage from "./container/Login/LoginWebPage";
import { ToastContainer } from "react-toastify";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

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
            </Routes>
            <ToastContainer
                position="top-right"
                autoClose={4000}
                hideProgressBar={false}
            />
        </Router>
    );
}

export default App;
