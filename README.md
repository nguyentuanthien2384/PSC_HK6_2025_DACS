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

## Dữ liệu mẫu để test chức năng

Sau khi cấu hình kết nối database và chạy migration, nạp bộ dữ liệu demo:

```powershell
npm run db:seed:demo
npm run db:verify:demo
```

Lệnh demo độc lập với `db:seed`, không yêu cầu `SEED_ADMIN_EMAIL` hoặc `SEED_ADMIN_PASSWORD`. Seeder chỉ thêm dữ liệu, dùng transaction cho toàn bộ bộ mẫu và không xóa hay ghi đè bản ghi sẵn có. Marker `DEMO_DACS_V1_SEEDED` giúp chạy lại không tạo trùng, không đặt lại mật khẩu và giữ các thay đổi bạn đã test. Không chạy trong `NODE_ENV=production`.

Bộ mẫu gồm 32 tài khoản cho bốn vai trò, 52 địa chỉ, 40 sản phẩm với 87 biến thể màu và 291 lựa chọn kích thước, 8 danh mục, 6 thương hiệu, 6 nhà cung cấp và 4 phương thức vận chuyển. Có 12 phiếu nhập, 96 đơn hàng với 240 dòng hàng, 12 voucher, 54 dòng giỏ hàng, 208 đánh giá/bình luận/phản hồi, 12 cuộc chat với 60 tin nhắn, 4 banner và 12 bài viết. Ảnh minh họa lấy từ file đã có trong dự án, được lưu dạng data URI nên không cần tải ảnh từ dịch vụ ngoài.

Đăng nhập các tài khoản sau với mật khẩu chung `Demo@123456`:

- Quản trị: `admin@demo.dacs.test`.
- Nhân viên: `staff1@demo.dacs.test`, `staff2@demo.dacs.test`.
- Giao hàng: `shipper1@demo.dacs.test` đến `shipper3@demo.dacs.test`.
- Khách hàng: `customer01@demo.dacs.test` đến `customer24@demo.dacs.test`.
- Kiểm tra tài khoản bị khóa/chưa xác thực: xem các email trong `backend/scripts/demo/scenarios.cjs`.

Có thể đặt `SEED_DEMO_PASSWORD` trong `backend/.env` trước lần nạp đầu tiên. Đây là tài khoản thử nghiệm; các địa chỉ email mẫu không dùng để nhận thư.

Đơn mẫu gồm 12 chờ xác nhận, 8 chờ lấy hàng, 8 đang giao, 60 đã giao và 8 đã hủy. Lịch sử đã giao trải trong 180 ngày trước thời điểm seed, có đơn trong ngày để test thống kê. Có sản phẩm còn hàng, còn 1–3 đơn vị, hết hàng và ngừng kinh doanh; tồn kho được tính từ nhập hàng trừ đơn chưa hủy. Voucher có mã đang hiệu lực, hết hạn, chưa mở, hết lượt, đã lưu và đã dùng.

Các khách đầu tiên có sẵn giỏ hàng, địa chỉ và voucher để thử checkout COD. Shipper có đơn đang giao; đơn chờ lấy hàng chưa gán shipper để thử nhận giao. 20 đơn đã giao có trạng thái thanh toán online và phiên `COMPLETED` **mô phỏng**, không phải giao dịch thật với PayPal/VNPay và không gửi email hay yêu cầu tới cổng thanh toán.

`db:verify:demo` kiểm tra liên kết dữ liệu, tồn kho, giá chốt đơn và truy cập API bằng các vai trò trên database đã seed. Không dùng `test:integration` với database đang làm việc; bộ integration cần database kiểm thử riêng.

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

Nếu database hoặc JWT chưa được cấu hình đúng, backend báo lỗi khởi động cụ thể. Với XAMPP, kiểm tra cổng MySQL trong `mysql/bin/my.ini`: môi trường local ngày 09/10/2026 dùng cổng 3333 và database `ecom`. Khi thay đổi cấu hình, khởi động lại backend và đăng nhập lại để nhận token mới.

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
