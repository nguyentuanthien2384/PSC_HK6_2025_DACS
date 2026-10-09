# DACS E-commerce

Ứng dụng bán hàng React + Express + Sequelize/MySQL. Giữ giao diện và API hiện có, bổ sung kiểm tra quyền truy cập, checkout bằng dữ liệu backend, giao dịch cơ sở dữ liệu và xác nhận thanh toán.

## Yêu cầu

- Node.js 20 trở lên và npm.
- MySQL 8, một database và tài khoản có quyền tạo/cập nhật bảng.
- SMTP và tài khoản sandbox PayPal/VNPay nếu dùng email hoặc thanh toán trực tuyến. COD hoạt động độc lập với các dịch vụ này.

## Cài đặt và cấu hình

Chạy tại thư mục dự án:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
```

Tạo hoặc cập nhật `backend/.env` theo `backend/.env.example`. Không chép đè cấu hình đang dùng nếu database đã có dữ liệu. Điền đúng `DB_HOST`, `DB_PORT`, `DB_DATABASE_NAME`, `DB_USERNAME`, `DB_PASSWORD`. Database phải tồn tại trước khi migration.

`JWT_SECRET` cần ít nhất 32 ký tự. Có thể tạo khóa bằng:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Trong `frontend/.env`, đặt:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:6969
```

Backend mặc định chạy cổng 6969, frontend cổng 3000. `URL_REACT` và `CORS_ORIGINS` phải khớp địa chỉ frontend. Sau khi đổi biến môi trường, khởi động lại tiến trình đang chạy.

## Cập nhật database và tạo tài khoản quản trị

```powershell
npm run db:check
npm run db:migrate
```

Migration bổ sung `PaymentSessions`, các cột chốt giá trong đơn hàng và ràng buộc email tài khoản duy nhất. Nếu database cũ có email trùng, migration báo lỗi để bạn đối chiếu tài khoản trước, không tự xóa hay gộp dữ liệu. Không chạy `sync({ force: true })` hoặc reset database. Với database đã tồn tại, kiểm tra `npm --prefix backend run db:status` trước; nếu schema được nhập thủ công và chưa có SequelizeMeta, cần đối chiếu migration với bảng đang có trước khi áp dụng.

Để khởi tạo lần đầu, đặt `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` trong backend/.env rồi chạy:

```powershell
npm --prefix backend run db:seed
```

Seeder thêm mã vai trò, giới tính, trạng thái đơn hàng, loại giảm giá và kích thước; tài khoản quản trị dùng mật khẩu bạn đã cấu hình. Chạy lại không tạo trùng bản ghi đã tồn tại. Danh mục, thương hiệu, sản phẩm, nhà cung cấp và phí vận chuyển được quản trị tạo từ giao diện. Nhập hàng bằng phiếu nhập để có tồn kho bán.

## Chạy dự án

```powershell
npm start
```

Hoặc mở hai terminal:

```powershell
npm --prefix backend run dev
npm --prefix frontend start
```

Frontend: http://localhost:3000. Health API: http://localhost:6969/api/health.

Nếu database hoặc JWT chưa được cấu hình đúng, backend báo lỗi khởi động cụ thể. Trên môi trường kiểm tra ngày 09/10/2026, tài khoản MySQL trong backend/.env bị từ chối (`ER_ACCESS_DENIED_ERROR`) và JWT_SECRET chỉ có 9 ký tự; phải sửa hai giá trị này trước khi chạy với database đó.

## Các luồng đã hoàn thiện

- Đăng ký, đăng nhập, đổi mật khẩu, xác thực email, yêu cầu và đặt lại mật khẩu. Tài khoản tự đăng ký luôn là khách hàng.
- Token được đọc ở mỗi request; dữ liệu phiên lỗi không làm crash trang. API không gửi token cho dịch vụ bên ngoài.
- Giỏ hàng, địa chỉ, voucher, đơn hàng và chat xác định người dùng từ JWT. Khách hàng không đọc/sửa dữ liệu của tài khoản khác.
- Checkout xác minh địa chỉ, sản phẩm đang bán, số lượng, tồn kho, voucher và phí vận chuyển. Backend chốt giá, thực hiện giao dịch và khóa biến thể để tránh bán vượt tồn kho.
- Đơn COD tiêu thụ giỏ hàng một lần. Đơn lưu giá sản phẩm, tiền hàng, phí giao, mức giảm và tổng tiền; lịch sử và doanh thu dùng các giá đã lưu.
- Hủy đơn COD hợp lệ trả lại tồn kho. Địa chỉ, biến thể và phiếu nhập đã liên quan tới hàng bán được bảo vệ khỏi thao tác xóa làm mất lịch sử.
- Thanh toán trực tuyến lưu phiên và giữ hàng 30 phút. Callback phải khớp phiên của người dùng, chữ ký/kết quả cổng thanh toán và số tiền; gửi lại callback không tạo thêm đơn.
- Chat HTTP/Socket cần token, giới hạn phòng theo quyền, lưu tin nhắn trước khi thông báo và xác nhận gửi.
- API dữ liệu thiếu hoặc bản ghi không tồn tại trả kết quả lỗi; phân biệt lỗi đăng nhập 401 và thiếu quyền 403. CORS hỗ trợ preflight cho frontend được cấu hình.

## Email và thanh toán

Điền SMTP bằng `EMAIL_APP`/`EMAIL_APP_PASSWORD` hoặc `SMTP_USER`/`SMTP_PASSWORD`; có thể cấu hình host, port, secure và sender. Gmail dùng mật khẩu ứng dụng. Link email dùng `URL_REACT`; token có mục đích, thời hạn và dùng một lần.

PayPal dùng `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE` và `USD_EXCHANGE_RATE`. Tỷ giá là cấu hình cửa hàng, không tự động cập nhật.

VNPay dùng `VNP_TMNCODE`, `VNP_HASHSECRET`, `VNP_URL`, `VNP_RETURNURL`. Thiếu cấu hình sẽ báo lỗi để khách có thể chọn COD. Chưa kiểm thử giao dịch thật với nhà cung cấp hoặc gửi email thật do chưa có tài khoản dịch vụ.

Phiên thanh toán hết hạn có thể cần đối soát thủ công nếu khách đã bị trừ tiền. Hoàn tiền tự động và webhook/IPN đối soát nền chưa được triển khai; không coi callback trình duyệt là giải pháp đối soát đầy đủ để đưa thanh toán thật vào vận hành.

## Kiểm thử

```powershell
npm test
npm run build
```

Frontend có 24 kiểm thử; backend có 24 kiểm thử logic và HTTP, không yêu cầu MySQL/SMTP.

Bộ tích hợp có 17 kịch bản dùng MySQL thật. Chỉ chạy trên database kiểm thử riêng có tên chứa `test` hoặc `integration`; fixture thêm dữ liệu, không xóa dữ liệu hiện có. Migration database này trước khi chạy.

```powershell
$env:NODE_ENV='test'
$env:RUN_DB_TESTS='true'
$env:TEST_DB_HOST='127.0.0.1'
$env:TEST_DB_PORT='3306'
$env:TEST_DB_DATABASE_NAME='dacs_ecommerce_test'
$env:TEST_DB_USERNAME='test_user'
$env:TEST_DB_PASSWORD='your_test_password'
npm --prefix backend run db:migrate
npm --prefix backend run test:integration
```

Đã kiểm thử migration và checkout đồng thời trên một MySQL riêng ở cổng 13306, không sửa database đang dùng. VNPay trong bộ test dùng chữ ký thử nghiệm do test tạo; kết quả này xác minh logic nội bộ, không thay thế việc thử tài khoản sandbox của VNPay.

Bản production build có các cảnh báo ESLint từ giao diện cũ. Cần tiếp tục cải thiện các liên kết/biến không dùng và hook dependency; build vẫn tạo bundle thành công. Kiểm thử giao diện trực tiếp chưa thực hiện được vì cơ chế xét duyệt tự động chặn lệnh khởi chạy máy chủ preview.

## Lưu ý Git

`.gitignore` đã thêm các file môi trường, node_modules, build và thư mục thử nghiệm. Repo hiện đã theo dõi một số file này từ trước; ignore không tự bỏ chúng khỏi lịch sử Git. Trước khi chia sẻ repo, loại các file chứa cấu hình bí mật khỏi chỉ mục và quản lý khóa dịch vụ bên ngoài Git.
