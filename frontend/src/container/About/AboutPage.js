import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getUser } from '../../utils/token';
import './AboutPage.scss';

export default function AboutPage() {
    const location = useLocation();
    const user = getUser();
    const orderLink = user ? `/user/order/${user.id}` : '/login?redirect=%2Fuser';
    useEffect(() => {
        const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
        if (target) target.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, 0);
    }, [location.hash]);

    return <main className="about-page">
        <section className="about-hero">
            <div className="container">
                <nav aria-label="Đường dẫn" className="about-breadcrumb"><Link to="/">Trang chủ</Link><span aria-hidden="true">/</span><span aria-current="page">Giới thiệu &amp; hướng dẫn</span></nav>
                <p className="about-eyebrow">MUA SẮM VÀ QUẢN LÝ ĐƠN HÀNG</p>
                <h1>Từ chọn sản phẩm đến nhận hàng</h1>
                <p className="about-intro">Cửa hàng giúp bạn tìm sản phẩm, sử dụng voucher, lưu địa chỉ và theo dõi đơn mua trong cùng một tài khoản. Hướng dẫn dưới đây giúp bạn thực hiện từng bước và kiểm tra thông tin của đơn hàng.</p>
                <div className="about-actions"><Link className="btn btn-success" to="/shop">Khám phá sản phẩm</Link><Link className="btn btn-outline-secondary" to={orderLink}>{user ? 'Xem đơn mua của tôi' : 'Đăng nhập để quản lý đơn mua'}</Link></div>
            </div>
        </section>
        <div className="container about-content">
            <nav className="about-topics" aria-label="Nội dung hướng dẫn">
                <Link to="/about#dat-hang">Đặt hàng</Link><Link to="/about#giao-hang">Giao hàng</Link><Link to="/about#tra-hang">Trả hàng &amp; hoàn tiền</Link><Link to="/about#danh-gia">Đánh giá</Link><Link to="/about#thong-bao">Thông báo &amp; tin nhắn</Link>
            </nav>
            <section id="dat-hang" className="about-guide" aria-labelledby="dat-hang-title">
                <span className="about-step" aria-hidden="true">01</span>
                <div><h2 id="dat-hang-title">Chọn sản phẩm và đặt hàng</h2>
                    <ol>
                        <li>Tìm sản phẩm trong cửa hàng, xem thông tin và chọn màu, kích cỡ, số lượng phù hợp trước khi thêm vào giỏ.</li>
                        <li>Lưu voucher phù hợp và chọn voucher trong giỏ hàng. Kiểm tra giá sản phẩm, ưu đãi, phí vận chuyển và tổng tiền trước khi đặt.</li>
                        <li>Chọn địa chỉ giao hàng và phương thức thanh toán đang hiển thị. Kiểm tra tên người nhận, số điện thoại và địa chỉ rồi xác nhận đơn.</li>
                    </ol>
                    <p>Địa chỉ mặc định giúp bạn chọn nhanh ở lần mua tiếp theo. Bạn vẫn có thể chọn địa chỉ khác trước khi gửi đơn.</p>
                    <div className="about-links"><Link to="/shopcart">Mở giỏ hàng</Link><Link to="/voucher">Xem voucher</Link>{user && <Link to={`/user/address/${user.id}`}>Quản lý địa chỉ</Link>}</div>
                </div>
            </section>
            <section id="giao-hang" className="about-guide" aria-labelledby="giao-hang-title">
                <span className="about-step" aria-hidden="true">02</span>
                <div><h2 id="giao-hang-title">Theo dõi đơn và giao hàng</h2>
                    <p>Mở <strong>Đơn mua</strong> và xem chi tiết để kiểm tra trạng thái, lịch sử cập nhật và thông tin vận chuyển của từng đơn.</p>
                    <p>Đơn giao nội bộ được phân công cho shipper sau khi cửa hàng xác nhận. Nếu giao thất bại, bạn có thể theo dõi cập nhật giao lại hoặc hoàn về kho trong đơn hàng.</p>
                    <p>Với hãng vận chuyển bên ngoài, mã vận đơn và trạng thái vận chuyển xuất hiện trong chi tiết đơn sau khi cửa hàng tạo vận đơn.</p>
                    <p>Nếu muốn hủy một đơn chưa giao, kiểm tra thao tác và điều kiện đang hiển thị trong đơn. Với đơn đã thanh toán, cần trao đổi với cửa hàng để xử lý khoản tiền đã trả.</p>
                    <div className="about-links"><Link to={orderLink}>{user ? 'Theo dõi đơn mua' : 'Đăng nhập để xem đơn mua'}</Link><Link to="/user/messenger">Trao đổi với cửa hàng</Link></div>
                </div>
            </section>
            <section id="tra-hang" className="about-guide" aria-labelledby="tra-hang-title">
                <span className="about-step" aria-hidden="true">03</span>
                <div><h2 id="tra-hang-title">Trả hàng và nhận tiền hoàn</h2>
                    <p>Điều kiện và hạn gửi yêu cầu trả hàng được hiển thị trong chi tiết đơn. Khi đơn đủ điều kiện, bạn có thể gửi yêu cầu trả toàn bộ đơn hàng.</p>
                    <ol>
                        <li>Nhập lý do trả hàng và bổ sung ảnh minh chứng nếu có.</li>
                        <li>Chờ cửa hàng duyệt yêu cầu và đọc hướng dẫn gửi trả trước khi gửi hàng.</li>
                        <li>Sau khi gửi hàng, cập nhật hãng vận chuyển và mã vận đơn trả hàng thực tế trong đơn.</li>
                        <li>Theo dõi kết quả kiểm nhận của cửa hàng và trạng thái hoàn tiền.</li>
                    </ol>
                    <p>Với đơn thanh toán trực tuyến, khoản hoàn được xử lý qua cổng thanh toán của giao dịch. Trạng thái <strong>chờ hoàn tiền</strong> chưa xác nhận tiền đã được hoàn thành công.</p>
                    <p>Với đơn COD, cửa hàng ghi nhận khoản hoàn cùng mã giao dịch và chứng từ. Kiểm tra thông tin trong đơn nếu cần đối chiếu.</p>
                    <div className="about-links"><Link to={orderLink}>{user ? 'Kiểm tra điều kiện trả hàng của đơn' : 'Đăng nhập để kiểm tra đơn hàng'}</Link></div>
                </div>
            </section>
            <section id="danh-gia" className="about-guide" aria-labelledby="danh-gia-title">
                <span className="about-step" aria-hidden="true">04</span>
                <div><h2 id="danh-gia-title">Đánh giá sau khi nhận hàng</h2>
                    <p>Sản phẩm đã mua và giao thành công có thể được đánh giá trên trang chi tiết sản phẩm khi tài khoản của bạn đủ điều kiện. Chọn số sao và viết nhận xét về sản phẩm đã nhận.</p>
                    <p>Với đơn giao nội bộ, người mua có thể đánh giá shipper trong chi tiết đơn sau khi giao thành công. Mỗi đơn được đánh giá shipper một lần.</p>
                    <div className="about-links"><Link to={orderLink}>{user ? 'Xem đơn đã nhận' : 'Đăng nhập để xem đơn đã nhận'}</Link><Link to="/shop">Tìm sản phẩm đã mua</Link></div>
                </div>
            </section>
            <section id="thong-bao" className="about-guide" aria-labelledby="thong-bao-title">
                <span className="about-step" aria-hidden="true">05</span>
                <div><h2 id="thong-bao-title">Nhận thông báo và trao đổi</h2>
                    <p>Trang thông báo lưu các cập nhật về đơn hàng, giao hàng và trả hàng. Bạn có thể mở chi tiết từ thông báo và đánh dấu đã đọc.</p>
                    <p>Khi cần trao đổi thêm, mở tin nhắn trong tài khoản và cung cấp mã đơn cùng nội dung cần hỗ trợ để cửa hàng kiểm tra.</p>
                    <div className="about-links"><Link to="/notifications">Xem thông báo</Link><Link to="/user/messenger">Mở tin nhắn</Link></div>
                </div>
            </section>
        </div>
    </main>;
}
