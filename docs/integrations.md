# Vận hành giao hàng, trả hàng và thanh toán

## Trạng thái đã triển khai

Luồng nội bộ sử dụng database thật: checkout, phân công shipper, giao thành công, đánh giá, giao thất bại/giao lại, hoàn kho, trả hàng và thông báo. GHN/GHTK và VNPay/PayPal có adapter gọi API nhà cung cấp, xác minh kết quả và lưu đối soát. Thiếu khóa dịch vụ sẽ báo chưa cấu hình; không tự tạo kết quả giao hàng hoặc hoàn tiền thành công.

Các kiểm thử tự động dùng MySQL riêng cho dữ liệu nghiệp vụ và phản hồi API có kiểm soát cho nhà cung cấp. Chưa xác nhận giao dịch sandbox trực tiếp với nhà cung cấp vì chưa có merchant/token và webhook HTTPS công khai. Dữ liệu thanh toán demo `COMPLETED` có từ seeder vẫn là dữ liệu mô phỏng.

## Cập nhật và chạy local

Điền cấu hình của riêng môi trường trong `backend/.env`, tham khảo `backend/.env.example`. Không đưa khóa vào frontend hoặc commit Git. Chạy từ thư mục dự án:

```powershell
npm run db:migrate
npm run db:check
npm start
```

Migration chỉ bổ sung bảng/cột/index, giữ dữ liệu hiện có. Bản này thêm OrderEvents, ReturnRequests, InventoryAdjustments, Shipments, Notifications và PaymentRefunds. Migration sửa bổ sung `zzzzzzzzzz-20261012-refund-fulfillment-sync.js` cũng nâng cấp database đã chạy bản payment migration trước đó.

Frontend lấy cổng từ `frontend/.env`; local hiện tại dùng `http://127.0.0.1:3001`, backend `http://localhost:6969`. Khi thay `.env`, khởi động lại backend. Có thể đặt `BACKGROUND_JOBS_ENABLED=false` trong **môi trường tiến trình** khi chỉ kiểm tra giao diện và chưa muốn gọi dịch vụ bên ngoài; mặc định worker chạy khi backend khởi động.

## Shipper cửa hàng và hãng vận chuyển

- Shipper R3 dùng `/shipper`, chỉ nhận đơn S4 chưa được giao cho người khác. Hoàn tất đơn của chính mình ở S5; người mua chỉ đánh giá shipper sau S6. Đơn hãng vận chuyển không thể bị shipper nội bộ nhận hoặc đánh dấu đã giao.
- Nhân viên/admin chọn GHN hoặc GHTK trong chi tiết đơn S4, điền khối lượng gram, kích thước centimet và tên tỉnh/phường nhận hàng. Mã vận đơn, môi trường và lịch sử được lưu. Địa chỉ, sản phẩm và COD lấy từ đơn trên server; phí hãng do cửa hàng trả để tránh thu phí hai lần từ khách.
- Tạo vận đơn có khóa đồng thời, mã đơn riêng và lease. Timeout giữ `UNCERTAIN`: đồng bộ bằng mã đã lưu trước khi thử tạo tiếp, tránh đặt hai vận đơn. Đơn vẫn chờ lấy hàng cho đến khi hãng xác nhận lấy hàng.
- Webhook chỉ là tín hiệu: backend xác minh secret rồi truy vấn API hãng. Trạng thái tài xế tạm thời của GHTK không tự coi là giao thành công. Hàng hoàn của hãng ở S9 cho đến khi cửa hàng thực sự nhận và kiểm tra tại kho.

GHN sandbox: `GHN_MODE=sandbox`, token sandbox, `GHN_SHOP_ID` của shop tương ứng; địa chỉ lấy hàng dùng cấu hình shop trên GHN. GHTK sandbox: `GHTK_MODE=sandbox`, `GHTK_TOKEN`, tùy chọn `GHTK_PARTNER_CODE` và toàn bộ `SHIPPING_PICK_*` cần thiết. Token production và sandbox phải tách biệt.

Đăng ký URL HTTPS tại nhà cung cấp:

- GHN: `https://<backend-domain>/api/shipping/webhooks/ghn`
- GHTK: `https://<backend-domain>/api/shipping/webhooks/ghtk`

Đặt `GHN_WEBHOOK_SECRET`/`GHTK_WEBHOOK_SECRET` riêng, tối thiểu 24 ký tự, gửi header `x-shipping-secret`; nếu hãng chỉ hỗ trợ URL callback thì dùng tham số `?hash=<secret>`. Khi dùng query, cần che giá trị query khỏi access log của reverse proxy. API hãng được truy vấn lại trước mọi cập nhật trạng thái.

Tham khảo API chính thức: [GHN tạo đơn](https://developer.ghn.vn/vi/docs/order/create), [GHN tra cứu mã khách hàng](https://developer.ghn.vn/vi/docs/order/info-by-client-code), [GHTK tổng quan](https://api.ghtk.vn/docs/submit-order/logistic-overview/), [GHTK tra cứu](https://api.ghtk.vn/docs/submit-order/tracking-status/).

## Giao thất bại, hoàn kho và trả hàng

Giao nội bộ đi qua S5 → S8 khi thất bại, phải có lý do; S8 → S5 khi giao lại, mặc định tối đa 3 lần (`DELIVERY_MAX_ATTEMPTS`). S5/S8 → S9 khi hoàn kho, rồi S10 khi admin nhận thực tế. Chỉ cộng tồn bán được khi hàng được kiểm tra là có thể bán lại. Phiếu nhập gốc và giá vốn vẫn được giữ.

Người mua yêu cầu **trả toàn bộ đơn**, mặc định trong 7 ngày từ `deliveredAt` (`RETURN_WINDOW_DAYS`); giao diện hiển thị điều kiện và hạn trả. Đơn cũ thiếu thời điểm giao riêng không được tự suy đoán hạn trả. Luồng là REQUESTED → APPROVED → SHIPPED → REFUND_PENDING → REFUNDED. Yêu cầu bị từ chối giữ lịch sử; người mua có thể gửi lại nếu còn đủ điều kiện.

Cửa hàng duyệt/từ chối và ghi chú, khách nhập hãng/mã gửi trả, cửa hàng kiểm tra hàng trước khi nhập kho và hoàn tiền. Hàng hư hỏng có thể được hoàn tiền theo quyết định của cửa hàng nhưng không cộng tồn bán được. Kho, lịch sử và thông báo dùng cùng transaction; gửi lại thao tác không nhập kho/hoàn tiền thêm lần nữa.

Hoàn COD là **xác nhận chuyển tiền thủ công**: nhân viên phải chuyển tiền bên ngoài, sau đó lưu mã và ảnh minh chứng. Nút xác nhận không tự chuyển tiền. Đơn COD chưa giao/thu tiền không sinh khoản hoàn. Đơn online đã thanh toán được hoàn qua cổng gốc; thiếu merchant giữ chờ hoàn. Số tiền hoàn lấy từ tổng đã chốt trên server.

Hiện hỗ trợ trả cả đơn; chưa có đổi hàng tự động hoặc chọn trả một phần từng dòng sản phẩm.

## Thanh toán sandbox và đối soát

PayPal mới dùng Orders v2/Captures; phiên v1 cũ vẫn được đối soát theo phiên bản đã lưu. Điền `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` của cùng ứng dụng sandbox và `USD_EXCHANGE_RATE` do cửa hàng quản lý. Đăng ký webhook HTTPS:

`https://<backend-domain>/api/payments/paypal/webhook`

Đăng ký sự kiện capture completed/refunded/reversed; nếu còn giao dịch v1, thêm sale completed/refunded/reversed. Backend xác minh chữ ký webhook bằng API PayPal rồi kiểm tra giao dịch, người nhận, tiền tệ, số tiền và phiên checkout. Return URL frontend không thay thế webhook. Tham khảo [PayPal Orders v2](https://developer.paypal.com/api/orders/v2), [PayPal Payments v2](https://developer.paypal.com/api/payments/v2/).

VNPay cần merchant sandbox cấp `VNP_TMNCODE`, `VNP_HASHSECRET`. Dùng URL sandbox trong file mẫu cho `VNP_URL` và `VNP_API_URL`; `VNP_RETURNURL` là trang frontend `/payment/vnpay_return`. Đặt `VNP_IPN_URL` và đăng ký URL HTTPS này tại VNPay:

`https://<backend-domain>/api/payments/vnpay/ipn`

IPN xác minh HMAC, merchant, mã phiên và số tiền; trả `RspCode` theo giao thức VNPay. Quyền truy vấn/hoàn tiền cũng cần được cấp cho merchant. `PAYMENT_SERVER_IP` là IP server dùng trong yêu cầu truy vấn/hoàn, cấu hình đúng môi trường. Tham khảo [VNPay truy vấn/hoàn tiền](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr&refund.html).

Trang `/system/home/payment-reconciliation` cho admin/nhân viên xem cấu hình, phiên chưa xác định và ledger hoàn tiền; đối soát từng phiên, kiểm tra lại khoản hoàn hoặc hoàn giao dịch đã thu nhưng không có đơn. Hệ thống chỉ báo thành công sau xác minh. Phiên đã thu nhưng hết thời gian giữ hàng không tự tạo đơn vượt tồn: lưu `REVIEW_REQUIRED` để xử lý. Kết quả hoàn chưa rõ được truy vấn trước khi gửi lại, bảo vệ khỏi hoàn hai lần.

Worker chạy theo `RECONCILIATION_INTERVAL_MS` (mặc định 60 giây, tối thiểu 30 giây), xử lý batch có giới hạn. Phiên thanh toán/khoản hoàn có khoảng chờ kiểm tra 5 phút; vận đơn được đồng bộ theo batch. Không có worker riêng ngoài tiến trình backend; cần giữ backend hoạt động để đối soát nền.

## Thông báo và báo cáo

Thông báo trạng thái được lưu cho đúng chủ tài khoản, có chưa đọc/đã đọc và trang `/notifications`. Socket chỉ phát sau commit; frontend có polling khi mất kết nối. Nhật ký đơn giữ các mốc giao hàng, trả hàng và hoàn tiền.

Doanh thu trừ **khoản hoàn đã xác nhận**, không trừ khoản đang chờ. Báo cáo quy khoản hoàn về kỳ giao của đơn gốc; đây không phải báo cáo dòng tiền theo ngày chuyển khoản hoàn. Xuất Excel có tổng đơn, đã hoàn và doanh thu sau hoàn. Giá vốn/lợi nhuận vẫn là ước tính; hoàn cả đơn bán lại được đảo giá vốn ước tính, hàng hỏng giữ chi phí để thể hiện tổn thất.

## Kiểm thử trước khi bật dịch vụ bên ngoài

`npm test` chạy unit/HTTP không cần dịch vụ bên ngoài, `npm run build` kiểm tra production bundle. `npm --prefix backend run test:integration` chạy tất cả bộ MySQL khi đặt `NODE_ENV=test`, `RUN_DB_TESTS=true` và đủ `TEST_DB_*` cho database **riêng** có tên chứa `test` hoặc `integration`; migrate trước. Fixture thêm dữ liệu, không reset schema hoặc xóa dữ liệu hiện có.

Khi có khóa sandbox, kiểm tra một đơn COD GHN/GHTK, một đơn online COD=0, callback giao/hoàn kho; PayPal/VNPay thành công, hủy/thất bại, webhook lặp và hoàn tiền. Xác nhận trên dashboard nhà cung cấp rồi đối chiếu phiên/đơn/ledger trong dự án. Chỉ chuyển mode và URL sang production khi tài khoản thật, HTTPS, callback và quyền hoàn tiền đã được xác nhận.
