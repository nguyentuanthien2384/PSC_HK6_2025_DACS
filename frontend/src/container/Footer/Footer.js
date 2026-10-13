import React from "react";
import { Link } from "react-router-dom";
import { getUser } from "../../utils/token";

function Footer() {
  const user = getUser();
  return (
    <footer className="footer-area section_gap">
      <div className="container">
        <div className="row">
          <div className="col-lg-3 col-md-6 single-footer-widget">
            <h4>Cửa hàng trực tuyến</h4>
            <p>Khám phá sản phẩm, quản lý đơn mua và theo dõi giao hàng trong tài khoản của bạn.</p>
            <Link to="/about">Giới thiệu &amp; hướng dẫn</Link>
          </div>
          <nav className="col-lg-3 col-md-6 single-footer-widget" aria-label="Khám phá cửa hàng">
            <h4>Khám phá</h4>
            <ul>
              <li><Link to="/shop">Sản phẩm</Link></li>
              <li><Link to="/voucher">Voucher</Link></li>
              <li><Link to="/blog">Bài viết</Link></li>
              <li><Link to="/shopcart">Giỏ hàng</Link></li>
            </ul>
          </nav>
          <nav className="col-lg-3 col-md-6 single-footer-widget" aria-label="Hướng dẫn mua sắm">
            <h4>Hướng dẫn</h4>
            <ul>
              <li><Link to="/about#dat-hang">Cách đặt hàng</Link></li>
              <li><Link to="/about#giao-hang">Theo dõi giao hàng</Link></li>
              <li><Link to="/about#tra-hang">Trả hàng &amp; hoàn tiền</Link></li>
              <li><Link to="/about#danh-gia">Đánh giá sản phẩm &amp; shipper</Link></li>
            </ul>
          </nav>
          <nav className="col-lg-3 col-md-6 single-footer-widget" aria-label="Tài khoản khách hàng">
            <h4>Tài khoản</h4>
            <ul>
              {user ? <>
                <li><Link to={`/user/detail/${user.id}`}>Hồ sơ của tôi</Link></li>
                <li><Link to={`/user/order/${user.id}`}>Đơn mua</Link></li>
                <li><Link to={`/user/address/${user.id}`}>Địa chỉ giao hàng</Link></li>
                <li><Link to={`/user/store-voucher/${user.id}`}>Kho voucher</Link></li>
              </> : <>
                <li><Link to="/login">Đăng nhập / Đăng ký</Link></li>
                <li><Link to="/forgot-password">Quên mật khẩu</Link></li>
              </>}
              <li><Link to="/notifications">Thông báo</Link></li>
              <li><Link to="/user/messenger">Tin nhắn</Link></li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom row align-items-center">
          <p className="footer-text m-0 col-lg-12">
            Đồ án cơ sở · Nhóm 6. Thiết kế giao diện từ{" "}
            {/* Preserve the original template attribution. */}
            <a href="https://colorlib.com" target="_blank" rel="noopener noreferrer">Colorlib</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
