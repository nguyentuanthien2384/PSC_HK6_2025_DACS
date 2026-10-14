# DACS E-commerce

Ứng dụng bán hàng React + Express + Sequelize/MySQL. Giữ giao diện và API hiện có, bổ sung kiểm tra quyền truy cập, checkout bằng dữ liệu backend, giao dịch cơ sở dữ liệu và xác nhận thanh toán.

## Yêu cầu

- Node.js 20.9 trở lên và npm (local đang dùng Node.js 24).
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

### Dữ liệu hoạt động cho khách hàng, shipper và dashboard

Nạp thêm lịch sử kinh doanh và các tình huống vận hành trên database đã migration:

```powershell
npm run db:seed:activity
npm run db:verify:activity
```

Lệnh tự nạp bộ demo cơ bản nếu chưa có, sau đó thêm 96 khách hàng (`customer25@demo.dacs.test` đến `customer120@demo.dacs.test`) và 5 shipper (`shipper4@demo.dacs.test` đến `shipper8@demo.dacs.test`). Tài khoản mới dùng `Demo@123456`, hoặc `SEED_DEMO_PASSWORD` nếu đã cấu hình. Tài khoản cũ giữ nguyên mật khẩu, hồ sơ và địa chỉ.

Bộ mở rộng gồm 1.200 đơn đã giao trải 365 ngày, mỗi ngày có doanh thu và có thêm lượng mua khác nhau theo thời gian. Mỗi khách hàng đang hoạt động có thêm một đơn ở từng trạng thái chờ xác nhận, chờ lấy hàng, đang giao, đã giao và đã hủy. Mỗi shipper đang hoạt động có thêm đơn giao thất bại, đang hoàn kho và đã nhận lại kho. Các tài khoản khách hàng/shipper có sẵn cũng được bổ sung đơn giả lập, kể cả tài khoản chưa xác thực email; seeder không thay đổi trạng thái xác thực.

Lần nạp local ngày 13/10/2026 thêm **1.847 đơn / 4.616 dòng hàng**, **900 đánh giá shipper**, **493 đánh giá sản phẩm đã mua**, **6.474 sự kiện xử lý đơn**, **4.804 thông báo** và **18 yêu cầu trả hàng** trải đủ sáu trạng thái. Có 13 phiếu nhập bù đúng lượng hàng dùng trong đơn mẫu và 40 dòng nhập lại kho cho hàng hoàn. Database sau nạp có 1.943 đơn và 140 tài khoản. Số lượng ở môi trường khác phụ thuộc số khách hàng và shipper đang hoạt động.

Đơn lưu đầy đủ ngày phân công/giao/hủy, lý do hủy hoặc giao thất bại và giá đã chốt để dashboard mặc định 30 ngày, biểu đồ tháng/năm, báo cáo doanh thu/lợi nhuận có dữ liệu. `customer01@demo.dacs.test` có đơn vừa giao chưa đánh giá shipper/chưa yêu cầu trả hàng để thử thao tác. Các thông báo có cả chưa đọc và đã đọc. Xem `/system/home`, `/system/home/statistics`, `/shipper` và lịch sử đơn trong tài khoản khách hàng.

341 phiên thanh toán online và ba khoản hoàn COD trong bộ local đều là **mô phỏng**, được đánh dấu `DEMO-`; không gọi cổng thanh toán, hãng vận chuyển, ngân hàng, email hay socket. Minh chứng khoản hoàn dùng ảnh logo minh họa. Toàn bộ thông tin và giao dịch mới là dữ liệu thử nghiệm, không phải giao dịch hoặc dữ liệu cá nhân thu thập từ người dùng thật.

Seeder chỉ thêm dữ liệu trong transaction, có khóa chống chạy đồng thời và marker `DEMO_DACS_ACTIVITY_V2_SEEDED`. Chạy lại không tạo trùng, không đặt lại mật khẩu và không thay đổi đơn đã thao tác. Không chạy ở `NODE_ENV=production`. Không reset database hoặc dùng `sync({ force: true })`.

`db:verify:activity` chỉ đọc dữ liệu: đối chiếu đơn, thanh toán, thời gian xử lý, đánh giá đã mua, thông báo, hàng hoàn và tồn kho; kiểm tra API theo vai trò và so sánh từng cột doanh thu ngày/tháng với các đơn thực sự lưu trong database. Lịch sử ban đầu v1 vẫn được kiểm tra bằng `db:verify:demo`.

## Chạy dự án

```powershell
npm start
```

Hoặc mở hai terminal:

```powershell
npm --prefix backend run dev
npm --prefix frontend start
```

Để sử dụng bản build nhẹ hơn khi xem sản phẩm, dừng `npm start` rồi chạy:

```powershell
npm run build
npm run preview
```

`preview` chạy backend cùng frontend đã build trên HOST/PORT trong `frontend/.env` (local: `http://127.0.0.1:3001`). Chế độ này không có biên dịch/watch trong trình duyệt; sau khi sửa frontend cần build lại. HTML được kiểm tra lại, tài nguyên JavaScript có tên hash được cache và nén. `npm start` vẫn dùng cho phát triển.

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

Đã triển khai IPN VNPay, webhook PayPal có xác minh, đối soát nền và hoàn tiền qua cổng gốc. Phiên hết hạn nhưng đã thu tiền được giữ để đối soát, không tự tạo đơn vượt tồn. Cần tài khoản sandbox và callback HTTPS để xác nhận trực tiếp với nhà cung cấp; xem [hướng dẫn tích hợp](docs/integrations.md).

## Bổ sung sau rà soát ngày 12/10/2026

- **Giao hàng:** tài khoản R3 đăng nhập vào `/shipper`, xem đơn chờ nhận, đơn đang giao và lịch sử. Đơn đi qua chờ xác nhận S3 → chờ lấy hàng S4 → được gán shipper S5 → giao xong S6. Admin chọn shipper đang hoạt động hoặc shipper tự nhận đơn S4. Khóa transaction ngăn hai người nhận cùng một đơn; gửi lại yêu cầu không đổi người giao hay thời điểm giao xong. Shipper chỉ hoàn tất đơn của mình, có thể đính kèm ảnh minh chứng.
- **Đánh giá shipper:** người mua đánh giá 1–5 sao và nhận xét sau khi đơn có shipper đã giao xong, mỗi đơn một lần. Khách, shipper và admin xem được đánh giá trong đơn; trang shipper có tổng đơn và điểm trung bình. Khách xác nhận đã nhận hàng chỉ khi đơn đang giao và có shipper.
- **Quản lý đơn:** khách lọc/tìm đơn, mở chi tiết và lịch sử trạng thái, hủy đơn COD trước giao với lý do. Admin không thể bỏ qua bước phân công; xuất Excel lấy đủ các trang. API chặn hủy đơn online đã thanh toán khi chưa có quy trình đối soát/hoàn tiền.
- **Đánh giá sản phẩm:** chỉ khách đã nhận sản phẩm mua trong đơn S6 được đánh giá; truy vấn đối chiếu đúng biến thể/kích thước. Mỗi tài khoản chỉ đánh giá một lần cho mỗi sản phẩm, kể cả gửi đồng thời. Giao diện thông báo điều kiện chưa đạt, trạng thái gửi và lỗi để thử lại.
- **Giỏ hàng/voucher:** chặn checkout với sản phẩm ngừng bán, hết hàng, vượt tồn hoặc số lượng chưa lưu. Nhập nhiều chữ số rồi lưu bằng Enter/rời ô. Voucher có ô nhập mã đã lưu, áp dụng/bỏ chọn và lý do không đủ điều kiện; giá trị tối thiểu tính trên tiền hàng, ngày hết hạn bao gồm hết ngày đó.
- **Địa chỉ:** lưu lựa chọn mặc định theo tài khoản, tự chọn địa chỉ đầu tiên khi chưa có địa chỉ, đổi mặc định và chọn lại sau khi xóa. Checkout ưu tiên địa chỉ mặc định. Thay đổi mặc định không sửa nội dung địa chỉ đã dùng trong lịch sử; địa chỉ đang liên quan đơn/phiên thanh toán được bảo vệ.
- **Thống kê:** doanh thu dùng giá đã chốt và thời điểm giao xong theo UTC+7; thống kê trạng thái lọc theo ngày đặt. Tồn kho có phân trang, số đang giữ thanh toán và số có thể bán. Báo cáo có trạng thái tải/lỗi/trống, xuất Excel và không xuất dữ liệu cũ sau khi lọc thất bại. Lợi nhuận được ghi rõ là ước tính, dùng giá nhập bình quân trước thời điểm giao, chưa trừ chi phí vận hành/giao hàng thực tế.

Hai migration mới là `zzzz-20261012-delivery-ratings.js` và `zzzzz-20261012-default-address.js`; chỉ thêm cột/bảng/index và điền địa chỉ mặc định, không reset database. Đã áp dụng trên database local `ecom`. Với checkout khác, chạy `npm run db:migrate` trước khi khởi động bản mới.

Đơn cũ chưa lưu `deliveredAt` dùng `updatedAt` để thống kê. Nếu ngày cập nhật từng bị thay đổi sau giao hàng, dữ liệu cũ không đủ để khôi phục chính xác ngày giao ban đầu; các đơn hoàn thành từ bản mới lưu thời điểm giao riêng.

Đã kiểm tra trực tiếp giao diện shipper, đơn khách hàng/đánh giá, địa chỉ và thống kê bằng tài khoản demo. Cổng frontend lấy từ `frontend/.env` (môi trường hiện tại: `http://127.0.0.1:3001`), backend cổng 6969. Chạy `npm start` nếu tiến trình chưa hoạt động.

## Hoàn thiện tích hợp vận hành

- **Ba cách giao hàng:** shipper cửa hàng, GHN và GHTK. Hãng vận chuyển có booking, mã vận đơn lưu database, đồng bộ và webhook truy vấn lại API hãng. Khóa đồng thời và giữ mã sau timeout ngăn tạo vận đơn trùng; đơn hãng không thể bị shipper nội bộ thao tác.
- **Giao thất bại/hoàn kho:** lưu lý do, giới hạn giao lại, nhận hàng hoàn thực tế và chỉ cộng tồn bán lại được một lần. Bảo vệ phiếu nhập gốc sau hàng bán/hoàn để giữ đúng lịch sử tồn và giá vốn.
- **Trả hàng/hoàn tiền:** yêu cầu trả cả đơn trong hạn, duyệt/từ chối, mã gửi trả, kiểm tra hàng, hoàn COD có minh chứng chuyển khoản thủ công hoặc hoàn online qua cổng gốc. Thiếu merchant giữ chờ hoàn; hàng chưa thu tiền không sinh khoản hoàn.
- **Thanh toán:** PayPal Orders v2 cho phiên mới, tương thích phiên v1 cũ; IPN VNPay và webhook PayPal xác minh chữ ký/giao dịch/số tiền. Ledger hoàn tiền, xử lý giao dịch đã thu nhưng chưa tạo đơn và trang đối soát `/system/home/payment-reconciliation` cho nhân viên/admin.
- **Thông báo:** lưu theo tài khoản, chưa đọc/đã đọc, liên kết đơn và nhật ký bất biến; socket phát sau commit, frontend có polling dự phòng.
- **Báo cáo:** tách tổng đơn, tiền đã hoàn và doanh thu sau hoàn; Excel dùng cùng dữ liệu. Hoàn được quy về kỳ giao của đơn gốc, chưa phải báo cáo dòng tiền theo ngày hoàn. Lợi nhuận vẫn là ước tính.
- **Hướng dẫn mua hàng:** `/about` và footer dùng nội dung tiếng Việt, liên kết đúng tính năng đang hoạt động.

Đã áp dụng 5 migration bổ sung vào `ecom`, giữ nguyên 96 đơn, 240 dòng hàng, 39 tài khoản, 87 sản phẩm và 16 phiếu nhập hiện có. Không reset database. Xem [cấu hình và kiểm thử sandbox](docs/integrations.md) để điền khóa GHN/GHTK/PayPal/VNPay và đăng ký webhook HTTPS.

Luồng nội bộ hoạt động với database thật. Kiểm thử provider dùng phản hồi API có kiểm soát; **chưa có giao dịch sandbox trực tiếp với nhà cung cấp** vì chưa có tài khoản/khóa merchant. SMTP cần cấu hình để xác nhận gửi email thật. Hiện trả cả đơn; chưa có đổi hàng tự động hoặc trả một phần từng sản phẩm.

## Trung tâm quản trị cửa hàng ngày 13/10/2026

Trang `/system/home` có giao diện quản trị riêng, sidebar/menu điện thoại, tìm đơn từ header và tải từng trang khi cần. Các màn hình nghiệp vụ dùng dữ liệu MySQL thật:

- **Tổng quan:** hàng đợi xác nhận, phân công, giao thất bại, hoàn kho và trả hàng; doanh thu sau khoản hoàn đã xác nhận, biểu đồ ngày, đơn gần đây và cảnh báo tồn. Khoảng ngày theo UTC+7. Đơn cũ thiếu ngày giao riêng dùng `updatedAt` với thông báo rõ giới hạn; đơn mới dùng `deliveredAt`. Không tự bịa tổng tiền của đơn cũ thiếu dữ liệu.
- **Đơn hàng:** lọc trạng thái, người nhận/mã đơn, hình thức thanh toán, đơn vị vận chuyển và ngày đặt; phân trang và xuất trang đang xem. Xác nhận/phân công nhiều đơn có bước xem lại, kiểm tra điều kiện từng đơn trong transaction và báo kết quả từng dòng. Bộ lọc nằm trong URL, hỗ trợ liên kết từ dashboard, tải lại và nút Back.
- **Trả hàng:** hàng đợi riêng theo các bước yêu cầu, duyệt, gửi trả, nhận kho và chờ hoàn; mở đúng chi tiết đơn để xử lý. Không đánh dấu đã hoàn tiền khi cổng thanh toán chưa xác nhận hoặc chưa có chứng từ COD.
- **Kho:** theo màu/kích cỡ/SKU, lọc hết/sắp hết trước phân trang, tách tồn ghi nhận, giữ thanh toán và có thể bán. Kiểm kê có lý do, ảnh chụp số tồn lúc mở phiếu, khóa cùng biến thể với checkout và mã chống gửi trùng. Tồn thay đổi yêu cầu xem lại rồi xác nhận; lỗi mạng giữ cùng mã để tránh ghi hai lần. Không giảm dưới hàng đang giữ cho thanh toán. Dòng kiểm kê có lịch sử riêng và tham gia phép tính tồn ở catalog, báo cáo và checkout.
- **Catalog:** danh sách gọn có bộ lọc, giá, số biến thể, ảnh thumbnail và phân trang; ẩn/mở bán nhiều sản phẩm có lý do và lịch sử. Phiếu nhập/biến thể có lịch sử bán hoặc kiểm kê được bảo vệ khỏi xóa. Thêm dòng và xóa phiếu nhập khóa cùng phiếu trước khi khóa biến thể để không bỏ sót dòng vừa được thêm đồng thời.
- **Tài khoản:** lọc cả tài khoản hoạt động/bị khóa, tạo và sửa thông tin, đổi vai trò/khóa/mở khóa có lý do. Không tự khóa/đổi vai trò hoặc loại hết quản trị viên; shipper đang giao/hoàn kho phải xử lý đơn trước. Đổi quyền/khóa thu hồi JWT cũ và ngắt socket sau commit; mở lại phải đăng nhập mới. Admin có thể sửa thông tin của tài khoản đang khóa mà không mở lại quyền đăng nhập.
- **Nhật ký:** ghi người thao tác, thời điểm, đối tượng, lý do và thay đổi trước/sau cho tạo/đổi quyền/khóa tài khoản, ẩn/mở catalog, kiểm kê và các sự kiện đơn do quản trị thực hiện. Nhật ký cùng transaction với thay đổi; lỗi lưu lịch sử hủy thay đổi tương ứng. API không cung cấp sửa/xóa nhật ký, không ghi mật khẩu/token/ảnh chứng từ. Lọc đối tượng, từ khóa và ngày; không tạo lại lịch sử quản trị đã xảy ra trước khi có bảng này.

Quản trị viên `R1` quản lý tài khoản, catalog, nội dung/khuyến mãi, cấu hình và tài chính. Nhân viên `R4` có dashboard vận hành, đơn/trả hàng/đối soát, kho/phiếu nhập/nhà cung cấp và hỗ trợ khách; dữ liệu tài chính tổng hợp và các trang chủ cửa hàng bị chặn ở cả giao diện lẫn API, kể cả endpoint cũ. Shipper/khách hàng không truy cập admin. Form sửa tài khoản không gửi vai trò đã tải trước đó; request tải chậm của tài khoản cũ không ghi đè tài khoản vừa chuyển sang.

Ba migration `zzzzzzzzzzzz-20261013-admin-audit.js`, `zzzzzzzzzzzz-20261013-admin-inventory.js` và `zzzzzzzzzzzz-20261013-user-auth-version.js` chỉ thêm bảng/cột/index. Đã áp dụng vào `ecom`, giữ nguyên 39 tài khoản, 87 sản phẩm, 96 đơn/240 dòng hàng, 16 phiếu nhập và 269 ảnh. Không reset dữ liệu.

Đây là quản trị một cửa hàng với nghiệp vụ thực tế, chưa phải nền tảng marketplace nhiều người bán, nhiều kho, chia hoa hồng hay hạ tầng ở quy mô Shopee/Tiki/Lazada. Tích hợp thanh toán/vận chuyển vẫn cần khóa và HTTPS để thử trực tiếp sandbox như hướng dẫn phía trên.

## Kiểm thử

```powershell
npm test
npm run build
```

Frontend có 284 kiểm thử; backend có 231 kiểm thử logic và HTTP, không yêu cầu MySQL/SMTP. Lệnh backend mặc định bỏ qua 7 bộ MySQL opt-in.

Bộ tích hợp có 52 kịch bản dùng MySQL thật, gồm checkout/shipper đồng thời, địa chỉ, trả hàng/hoàn kho, đối soát/hoàn tiền, vận đơn GHN/GHTK, phân trang/tồn kho catalog, phân quyền admin, xử lý nhiều đơn, kiểm kê đồng thời và thu hồi phiên đăng nhập/socket. Đã chạy đạt trên database riêng `dacs_ecommerce_integration_20261012`. Phản hồi API nhà cung cấp được kiểm soát trong test; không chuyển tiền hoặc tạo vận đơn ngoài hệ thống. Chỉ chạy trên database kiểm thử riêng có tên chứa `test` hoặc `integration`; không xóa dữ liệu hiện có. Fixture catalog chạy trong transaction và rollback. Migration database này trước khi chạy.

## Tối ưu tải sản phẩm ngày 13/10/2026

Danh sách, bộ sưu tập trang chủ và blog/banner dùng dữ liệu gọn; không gửi ảnh base64 hoặc toàn bộ mô tả trong JSON. Catalog công khai dùng 4 truy vấn SQL cho một trang, không tăng theo số sản phẩm; sắp xếp giá diễn ra trước phân trang. Trang chi tiết vẫn lấy đúng giá và tồn có thể bán; checkout tiếp tục khóa và xác minh tồn trong transaction.

Ảnh sản phẩm, banner và blog được phục vụ riêng tại `/api/media/...` bằng WebP có giới hạn kích thước, giữ tỷ lệ và không phóng ảnh nhỏ. Ảnh có ETag, URL theo hash nguồn và cache trình duyệt/disk; thay ảnh đổi URL kể cả cập nhật trong cùng một giây. Gốc trong database và tệp catalog vẫn được giữ, endpoint chỉnh sửa quản trị vẫn dùng ảnh gốc. Cache phát sinh ở `backend/.cache/product-media`, tối đa 128 MB/1000 tệp; cache phản hồi ảnh trong RAM tối đa 16 MB/128 ảnh, xử lý tối đa 2 ảnh đồng thời. Migration `zzzzzzzzzzz-20261013-product-image-version.js` thêm metadata hash, không reset/xóa ảnh hay sản phẩm. Chạy migration trước khi dùng mã mới.

Đo trên dữ liệu local hiện có: JSON trang 6 sản phẩm giảm từ **2.339.424 xuống 4.057 byte** (chưa tính ảnh tách riêng); ảnh WebP của trang đó **36.090 byte**, trong khi JSON cũ chứa khoảng 2,32 MB ảnh base64. Trang chủ 4 nhóm sản phẩm/banner/blog giảm JSON từ khoảng **6,43 MB xuống 16 KB**; ảnh tách riêng khoảng **565 KB**, được tải theo nhu cầu và cache. Đây là phép đo payload, không phải cam kết thời gian tải trên mọi máy/mạng.

Bundle JavaScript ban đầu production giảm từ **3.181.889 xuống 395.154 byte**, gzip từ **944.750 xuống 123.409 byte**. Trang quản trị, biểu đồ, trình soạn thảo, chat và Excel chỉ tải khi cần. Đã bỏ script plugin cũ/trùng; menu mobile và Bootstrap quản trị vẫn hoạt động. Header giữ chiều cao khi cuộn, skeleton giữ bố cục gần với thẻ thật; xử lý scroll theo animation frame, hủy request đã lỗi thời và gộp request đang chạy. Không cache giá/tồn kho theo TTL trong frontend.

Lặp phép đo listing/ảnh/ETag với backend đang chạy:

```powershell
npm --prefix backend run benchmark:catalog
```

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

VNPay trong bộ test dùng chữ ký thử nghiệm do test tạo; PayPal/GHN/GHTK dùng phản hồi API kiểm soát. Kết quả xác minh nghiệp vụ, HTTP, transaction và chống lặp, không thay thế việc thử trực tiếp tài khoản sandbox của nhà cung cấp.

Bản production build tạo bundle thành công, còn các cảnh báo ESLint từ giao diện cũ và dependency động của react-datepicker. Cần tiếp tục cải thiện các liên kết/biến không dùng, hook dependency và kích thước bundle. Đã kiểm tra giao diện trực tiếp bằng trình duyệt với backend/MySQL local; chưa kiểm thử email hoặc giao dịch thanh toán thật.

## Tối ưu chuyển mục và tải ảnh ngày 14/10/2026

- Mã trang cửa hàng/chi tiết và các trang catalog quản trị được tải trước khi người dùng giữ con trỏ trên liên kết, dùng bàn phím hoặc chạm để mở. Chỉ tải mã của trang được chọn; giá và tồn kho vẫn lấy mới. Bỏ qua tải trước khi bật tiết kiệm dữ liệu hoặc dùng mạng 2G. Lỗi tải mã có giao diện tải lại, giữ khung trang.
- Khi đổi bộ lọc/trang/sản phẩm, kết quả cũ không hiện dưới lựa chọn mới. Làm mới cùng lựa chọn giữ thẻ/bảng để giảm nhấp nháy; các thao tác quản trị bị khóa trong khi bảng đang cập nhật. Yêu cầu cũ bị hủy và không ghi đè kết quả mới.
- Danh mục, chi tiết, ảnh và kích cỡ quản trị chỉ gửi một yêu cầu ban đầu thay vì cả effect lẫn callback khởi tạo phân trang. Trang ảnh/kích cỡ có phân trang độc lập; form thêm/sửa và trình xem ảnh chỉ tải khi mở.
- Danh sách ảnh quản trị trả thumbnail và URL xem lớn, giữ ảnh gốc ở endpoint chỉnh sửa. Trên biến thể local được đo, JSON giảm từ **1.243.459 xuống 889 byte**; ảnh tải riêng và có cache. Ảnh đã có trên disk trả ngay, không phải chờ hàng đợi chuyển đổi ảnh mới.
- Chi tiết sản phẩm đọc ảnh và các nguồn tồn kho song song. Đo 20 lượt luân phiên trên sản phẩm local có 24 kích cỡ: trung vị dịch vụ **9,32 → 7,28 ms**, p95 **12,83 → 10,19 ms**. Phép đo bỏ qua ghi lượt xem và không bao gồm mạng/render; không phải thời gian tải trang toàn bộ.
- Thẻ sản phẩm dùng thumbnail có kích thước dự trữ; hàng đầu tải ảnh sớm. Gallery chọn biến thể còn hàng ngay lần render đầu. Banner chỉ dựng ảnh đang xem thay vì cả 6 ảnh; tạm dừng tự chuyển khi tab bị ẩn hoặc người dùng yêu cầu giảm chuyển động.

Kiểm thử bổ sung xác minh hủy yêu cầu, đổi bộ lọc nhanh, chuyển A → B → A, phân trang độc lập, giữ giá/tồn kho đúng, ảnh gốc chỉnh sửa và phục hồi lỗi tải mã. Kiểm thử MySQL catalog chạy trên database riêng với fixture rollback. Dùng `npm run build` rồi `npm run preview` để đánh giá bản tối ưu; `npm start` vẫn dành cho phát triển.

Đã kiểm tra bản build ngày 14/10 trực tiếp trên trình duyệt: đổi nhanh danh mục giày/đồng hồ, chi tiết sản phẩm có giá/tồn kho, tìm sản phẩm quản trị, mở biến thể/thumbnail/ảnh lớn và bảng tồn kho. Không có lỗi console trong các luồng này. Build thành công, còn cảnh báo lint/dependency ở mã giao diện cũ. Chưa đo FPS hay thời gian tải từ thiết bị di động/mạng Internet thực tế.

## Lưu ý Git

`.gitignore` đã thêm các file môi trường, node_modules, build và thư mục thử nghiệm. Repo hiện đã theo dõi một số file này từ trước; ignore không tự bỏ chúng khỏi lịch sử Git. Trước khi chia sẻ repo, loại các file chứa cấu hình bí mật khỏi chỉ mục và quản lý khóa dịch vụ bên ngoài Git.
