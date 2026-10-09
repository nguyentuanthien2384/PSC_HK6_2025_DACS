# Danh mục sản phẩm có nguồn

40 mẫu thật thay cho 40 sản phẩm `[DEMO]`: 18 UNIQLO, 10 giày adidas/Nike/Converse, 6 túi Juno/Vascara và 6 đồng hồ Casio. Mỗi JSON lưu mã mẫu, mô tả tiếng Việt biên soạn lại, thông số, màu, kích cỡ, ảnh, trang tham khảo và ngày đối chiếu. Không tự tạo xuất xứ, bảo hành, đánh giá hay quy đổi size.

Ảnh được lưu trong `frontend/public/catalog` để giao diện không phụ thuộc hotlink. `assets.json` ánh xạ URL nguồn sang ảnh cục bộ; script kiểm tra HTTP, MIME, chữ ký ảnh và giới hạn dung lượng. Ảnh nhiều màu được gắn đúng biến thể; các góc chụp thêm chỉ áp dụng cho mẫu có một phối màu.

Từ thư mục `backend`:

```powershell
npm run catalog:assets
npm run catalog:check
npm run catalog:import
npm run catalog:verify
```

Importer mặc định tạo sản phẩm **không có tồn kho**. Giá VND được xác minh trên nguồn nếu có; mẫu không có giá VND dùng giá bán đã cấu hình trong fixture dự án. Không chuyển giá USD thành VND, không tạo giá gạch ngang giả. Giá nguồn là ảnh chụp tại ngày đối chiếu, không tự đồng bộ giá hiện tại.

Để thử luồng mua hàng trên máy phát triển:

```powershell
node scripts/import-sourced-catalog.cjs --fixture-inventory
```

Cờ này thêm phiếu nhập `[Test]` nội bộ, giá vốn 0, tồn kho thử nghiệm 12/cỡ (2/cỡ với kịch bản ít hàng, 0 với hết hàng). Đây là cấu hình kiểm thử, không phải tồn kho hay nhà phân phối của hãng. Cờ bị chặn khi `NODE_ENV=production`. Trước triển khai bán thật, quản trị viên cần nhập giá bán, giá vốn, tồn kho và chính sách cửa hàng thực tế.

Importer kiểm tra đầy đủ trước khi ghi, dùng transaction và khóa database. Nó tạo 40 ID mới, đưa demo cũ về trạng thái ngừng bán và giữ nguyên tên, biến thể, đơn hàng, giỏ hàng, đánh giá cũ. Đánh giá demo không được chuyển sang sản phẩm thật. Dữ liệu khác không bị sửa. Marker trong `Allcodes` giúp chạy lại không nhân bản hoặc ghi đè chỉnh sửa của quản trị viên. Nhật ký ID được lưu tại `.tmp/sourced-catalog-v1.json`.

```powershell
npm run catalog:restore
```

Lệnh phục hồi chỉ đưa trạng thái demo cũ về như trước và ngừng bán các sản phẩm mới; không xóa bản ghi hoặc lịch sử. Sau phục hồi importer không tự chạy lại. Muốn đổi nội dung đã nhập, dùng chức năng quản trị hoặc một phiên bản migration mới.

Mô tả chứa liên kết nguồn trên trang chi tiết. Với Converse, ảnh đúng mẫu được lấy từ Pro:Direct Sport, kích cỡ từ Tactics, và thông tin mô tả từ Converse; các nguồn phụ được ghi riêng. Giá bán và tồn kho của cửa hàng không được suy ra từ tình trạng còn hàng trên website nguồn.
