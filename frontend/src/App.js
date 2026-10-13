import React, { lazy, Suspense } from "react";
import "./css/App.css";
import Header from "./container/Header/Header";
import Footer from "./container/Footer/Footer";
import TopMenu from "./container/Header/TopMenu";
import RequireAuth from "./component/RequireAuth";
import RouteScrollReset from "./component/RouteScrollReset";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

function lazyPage(loader) {
    const Page = lazy(loader);
    return function DeferredPage(props) {
        return <Suspense fallback={<main className="route-loading" role="status">Đang tải trang…</main>}><Page {...props} /></Suspense>;
    };
}

const HomePage = lazyPage(() => import("./container/Home/HomePage"));
const ShopPage = lazyPage(() => import("./container/Shop/ShopPage"));
const DetailProductPage = lazyPage(() => import("./container/DetailProduct/DetailProductPage"));
const ShopCartPage = lazyPage(() => import("./container/ShopCart/ShopCartPage"));
const LoginWebPage = lazyPage(() => import("./container/Login/LoginWebPage"));
const OrderHomePage = lazyPage(() => import("./container/Order/OrderHomePage"));
const VoucherHomePage = lazyPage(() => import("./container/Voucher/VoucherHomePage"));
const BlogPage = lazyPage(() => import("./container/Blog/BlogPage"));
const DetailBlog = lazyPage(() => import("./container/Blog/DetailBlog"));
const VnpayPaymentPage = lazyPage(() => import("./container/Order/VnpayPaymentPage"));
const VnpayPaymentSuccess = lazyPage(() => import("./container/Order/VnpayPaymentSuccess"));
const PaymentSuccess = lazyPage(() => import("./container/User/PaymentSuccess"));
const UserHomePage = lazyPage(() => import("./container/User/UseHomePage"));
const HomePageAdmin = lazyPage(() => import("./container/System/HomePageAdmin"));
const VerifyEmail = lazyPage(() => import("./container/System/Email/VerifyEmail"));
const ForgotPasswordPage = lazyPage(() => import("./container/Login/ForgotPasswordPage"));
const ShipperPage = lazyPage(() => import("./container/Shipper/ShipperPage"));
const NotificationsPage = lazyPage(() => import("./container/User/NotificationsPage"));
const AboutPage = lazyPage(() => import("./container/About/AboutPage"));

function App() {
    return (
        <Router>
            <RouteScrollReset />
            <Routes>
                <Route path="/notifications" element={<RequireAuth><Header /><NotificationsPage /><Footer /></RequireAuth>} />
                <Route path="/forgot-password" element={<><Header /><ForgotPasswordPage /><Footer /></>} />
                <Route path="/verify-forgotpassword" element={<><Header /><ForgotPasswordPage reset /><Footer /></>} />
                <Route path="/shipper" element={<RequireAuth roles={["R3"]}><Header /><ShipperPage /><Footer /></RequireAuth>} />
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
                            <AboutPage />
                            <Footer />
                        </>
                    }
                />
                {/* Day 28: Xác thực email từ link gửi qua mail */}
                <Route
                    path="/verify-email"
                    element={
                        <>
                            <Header />
                            <VerifyEmail />
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
                            <RequireAuth><ShopCartPage /></RequireAuth>
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
                            <RequireAuth owner><OrderHomePage /></RequireAuth>
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/success"
                    element={
                        <>
                            <Header />
                            <RequireAuth><PaymentSuccess /></RequireAuth>
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/vnpay"
                    element={
                        <>
                            <TopMenu />
                            <RequireAuth><VnpayPaymentPage /></RequireAuth>
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/payment/vnpay_return"
                    element={
                        <>
                            <TopMenu />
                            <RequireAuth><VnpayPaymentSuccess /></RequireAuth>
                            <Footer />
                        </>
                    }
                />
                <Route
                    path="/user/*"
                    element={
                        <RequireAuth>
                            <>
                                <Header />
                                <UserHomePage />
                                <Footer />
                            </>
                        </RequireAuth>
                    }
                />
                {/* Day 27: Admin shell */}
                <Route
                    path="/system/home/*"
                    element={
                        <RequireAuth roles={["R1", "R4"]}>
                            <HomePageAdmin />
                        </RequireAuth>
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
