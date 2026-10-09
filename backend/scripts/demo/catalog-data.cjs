'use strict';

// Deterministic fixtures only: this module performs no file, network or database I/O.
// imagePath is relative to the repository root. The seed runner should turn the
// checked-in image into a data URI and store that URI as UTF-8 in the image BLOB.
// Stock is a receipt total, not a ProductDetailSize column. initialStock must be
// inserted through ReceiptDetail; costPrice is the purchase price in VND.
const image = (relativePath, caption) => ({
  caption,
  imagePath: `frontend/public/resources/img/${relativePath}`,
  imageUrl: `https://technext.github.io/eiser/img/${relativePath}`,
});

const categories = [
  ['TSHIRT', 'Áo thun và polo'], ['SHIRT', 'Áo sơ mi'],
  ['DENIM', 'Quần jeans'], ['PANTS', 'Quần dài và quần short'],
  ['SHOES', 'Giày thời trang'], ['BAGS', 'Túi xách'],
  ['WATCH', 'Đồng hồ thời trang'], ['SPORT', 'Giày thể thao'],
].map(([key, value]) => ({ type: 'CATEGORY', code: `DEMO_CAT_${key}`, value }));

const brands = [
  ['MAY', 'Mây Studio'], ['URBAN', 'Urban Vibe'], ['SONG', 'Sông Việt'],
  ['LUA', 'Lụa House'], ['HEN', 'Điểm Hẹn'], ['PACE', 'Pace Lab'],
].map(([key, value]) => ({ type: 'BRAND', code: `DEMO_BRAND_${key}`, value }));

// Reuse the reference seeder's SIZE_S/M/L/XL codes instead of creating duplicate
// size labels in the admin dropdown. Other fixture codes are namespaced.
const sizes = [
  { type: 'SIZE', code: 'DEMO_SIZE_XS', value: 'XS' },
  ...['S', 'M', 'L', 'XL'].map(value => ({ type: 'SIZE', code: `SIZE_${value}`, value })),
  { type: 'SIZE', code: 'DEMO_SIZE_XXL', value: 'XXL' },
  ...[36, 37, 38, 39, 40, 41, 42, 43].map(value => ({ type: 'SIZE', code: `DEMO_SIZE_${value}`, value: String(value) })),
  { type: 'SIZE', code: 'DEMO_SIZE_FREE', value: 'Freesize' },
];

const subjects = [
  ['STYLE', 'Phối đồ hằng ngày'], ['CARE', 'Chăm sóc sản phẩm'],
  ['GUIDE', 'Hướng dẫn chọn mua'], ['NEWS', 'Tin cửa hàng'],
].map(([key, value]) => ({ type: 'SUBJECT', code: `DEMO_SUBJECT_${key}`, value }));

const suppliers = [
  { key: 'may', name: '[Demo] Xưởng may An Nhiên', address: '12 đường số 5, phường Bình Hưng Hòa, TP. Hồ Chí Minh', phonenumber: '0901000001', email: 'xuongmay.demo@example.com' },
  { key: 'denim', name: '[Demo] Công ty Denim Sông Việt', address: '85 Nguyễn Văn Linh, phường Hải Châu, Đà Nẵng', phonenumber: '0901000002', email: 'denim.demo@example.com' },
  { key: 'shoes', name: '[Demo] Kho giày Thành Phát', address: '26 Nguyễn Trãi, phường Thanh Xuân, Hà Nội', phonenumber: '0901000003', email: 'giay.demo@example.com' },
  { key: 'bags', name: '[Demo] Túi xách Mộc Lan', address: '43 Lê Văn Sỹ, phường Tân Sơn Hòa, TP. Hồ Chí Minh', phonenumber: '0901000004', email: 'tuixach.demo@example.com' },
  { key: 'watch', name: '[Demo] Đồng hồ Điểm Hẹn', address: '110 Trần Hưng Đạo, phường Ninh Kiều, Cần Thơ', phonenumber: '0901000005', email: 'dongho.demo@example.com' },
  { key: 'sport', name: '[Demo] Phân phối Pace Sport', address: '58 Lê Hồng Phong, phường Gia Viên, Hải Phòng', phonenumber: '0901000006', email: 'thethao.demo@example.com' },
];

const shippingMethods = [
  { key: 'standard', type: '[Demo] Tiêu chuẩn (3–5 ngày)', price: 30000 },
  { key: 'express', type: '[Demo] Nhanh (1–2 ngày)', price: 50000 },
  { key: 'same-day', type: '[Demo] Hỏa tốc nội thành', price: 75000 },
  { key: 'pickup', type: '[Demo] Nhận tại cửa hàng', price: 0 },
];

const media = {
  shirt: ['product/new-product/new-product1.png', 'product/new-product/new-product1.png'],
  denim: ['product/inspired-product/i2.jpg', 'product/new-product/n3.jpg'],
  shoes: ['product/feature-product/f-p-1.jpg', 'product/inspired-product/i4.jpg'],
  highTop: ['product/new-product/n1.jpg', 'product/inspired-product/i6.jpg'],
  sport: ['product/new-product/n4.jpg', 'product/inspired-product/i8.jpg'],
  tote: ['product/feature-product/f-p-2.jpg', 'product/inspired-product/i1.jpg'],
  shoulderBag: ['product/inspired-product/i7.jpg', 'product/inspired-product/i7.jpg'],
  watch: ['product/new-product/n2.jpg', 'product/inspired-product/i5.jpg'],
  squareWatch: ['product/feature-product/f-p-3.jpg', 'product/inspired-product/i3.jpg'],
};

// Product tuples: name, category, brand, price, material, image family, colors.
// Checked-in template images are illustrative demo photography; color and size
// selections represent test cases rather than a claim about the photographed item.
const productDefinitions = [
  ['Áo thun cotton Basic Everyday', 'TSHIRT', 'MAY', 189000, 'Cotton 100%', 'shirt', ['Trắng', 'Đen', 'Xanh navy']],
  ['Áo thun oversize Street Form', 'TSHIRT', 'URBAN', 249000, 'Cotton compact 240 GSM', 'shirt', ['Trắng kem', 'Xám khói']],
  ['Áo polo nam Classic Piqué', 'TSHIRT', 'SONG', 329000, 'Cotton piqué 95%, spandex 5%', 'shirt', ['Trắng', 'Xanh navy', 'Đen']],
  ['Áo thun nữ cổ tròn Soft Touch', 'TSHIRT', 'LUA', 219000, 'Cotton 92%, spandex 8%', 'shirt', ['Hồng phấn', 'Trắng kem']],
  ['Áo polo nữ dáng gọn City Walk', 'TSHIRT', 'HEN', 299000, 'Cotton piqué co giãn', 'shirt', ['Be', 'Xanh pastel']],

  ['Áo sơ mi Oxford công sở', 'SHIRT', 'SONG', 399000, 'Cotton Oxford', 'shirt', ['Trắng', 'Xanh nhạt']],
  ['Áo sơ mi linen tay ngắn Resort', 'SHIRT', 'MAY', 449000, 'Linen 55%, cotton 45%', 'shirt', ['Trắng kem', 'Be cát', 'Xanh olive']],
  ['Áo sơ mi nữ cổ trụ Thanh Lịch', 'SHIRT', 'LUA', 359000, 'Viscose 70%, polyester 30%', 'shirt', ['Trắng', 'Hồng đất']],

  ['Quần jeans nam Slim Fit Indigo', 'DENIM', 'URBAN', 499000, 'Denim cotton 98%, spandex 2%', 'denim', ['Xanh indigo', 'Đen']],
  ['Quần jeans nữ Straight Vintage', 'DENIM', 'MAY', 529000, 'Denim cotton 100%', 'denim', ['Xanh nhạt', 'Xanh đậm']],
  ['Quần jeans nam Regular Daily', 'DENIM', 'SONG', 459000, 'Denim cotton co giãn nhẹ', 'denim', ['Xanh trung', 'Đen xám']],
  ['Quần jeans nữ Wide Leg City', 'DENIM', 'LUA', 589000, 'Denim cotton 100%', 'denim', ['Xanh vintage', 'Xanh indigo']],
  ['Quần jeans unisex Loose Fit', 'DENIM', 'URBAN', 549000, 'Denim cotton 12 oz', 'denim', ['Xanh bạc', 'Đen']],

  ['Quần chino nam Smart Casual', 'PANTS', 'SONG', 429000, 'Cotton twill 97%, spandex 3%', 'denim', ['Be', 'Xanh navy']],
  ['Quần jogger unisex Comfort', 'PANTS', 'PACE', 349000, 'Cotton 80%, polyester 20%', 'denim', ['Xám', 'Đen', 'Xanh navy']],
  ['Quần short kaki Weekend', 'PANTS', 'MAY', 279000, 'Cotton kaki', 'denim', ['Be cát', 'Xanh olive']],
  ['Quần âu nữ Office Line', 'PANTS', 'LUA', 469000, 'Polyester 65%, viscose 30%, spandex 5%', 'denim', ['Đen', 'Xám ghi']],
  ['Quần cargo unisex Utility', 'PANTS', 'URBAN', 599000, 'Cotton ripstop', 'denim', ['Xanh rêu', 'Đen']],

  ['Giày sneaker da trắng Minimal', 'SHOES', 'HEN', 699000, 'Da tổng hợp, đế cao su', 'shoes', ['Trắng đen', 'Trắng be']],
  ['Giày sneaker cổ cao Urban High', 'SHOES', 'URBAN', 799000, 'Vải canvas, da tổng hợp', 'highTop', ['Xám hồng', 'Đen trắng']],
  ['Giày sneaker đôi Couple Step', 'SHOES', 'MAY', 649000, 'Da tổng hợp, lót vải thoáng khí', 'shoes', ['Trắng', 'Trắng đen', 'Kem']],
  ['Giày casual nam Clean Court', 'SHOES', 'SONG', 749000, 'Da PU, đế cao su chống trượt', 'shoes', ['Trắng đen', 'Xanh navy']],
  ['Giày sneaker nữ Pastel Day', 'SHOES', 'LUA', 729000, 'Vải dệt và da tổng hợp', 'highTop', ['Xám hồng', 'Hồng kem']],
  ['Giày sneaker unisex Retro Court', 'SHOES', 'HEN', 849000, 'Da tổng hợp, đế EVA', 'shoes', ['Trắng đen', 'Trắng xanh']],

  ['Túi tote nữ Everyday Carry', 'BAGS', 'LUA', 459000, 'Da PU, lót polyester', 'tote', ['Hồng rượu', 'Đen', 'Be']],
  ['Túi đeo vai nữ Sunset', 'BAGS', 'MAY', 399000, 'Da tổng hợp mềm', 'shoulderBag', ['Cam đất', 'Nâu']],
  ['Túi xách công sở Elegant', 'BAGS', 'HEN', 699000, 'Da PU cao cấp, khóa kim loại', 'tote', ['Đen', 'Hồng rượu']],
  ['Túi mini nữ City Date', 'BAGS', 'LUA', 329000, 'Da tổng hợp, quai tháo rời', 'shoulderBag', ['Cam san hô', 'Kem']],
  ['Túi đeo vai Retro Curve', 'BAGS', 'URBAN', 549000, 'Da PU vân mềm', 'shoulderBag', ['Cam', 'Đen']],
  ['Túi tote đi học Daily Book', 'BAGS', 'SONG', 279000, 'Vải canvas dày, lót cotton', 'tote', ['Be', 'Đen']],

  ['Đồng hồ dây da Classic Black', 'WATCH', 'HEN', 899000, 'Thép không gỉ, dây da tổng hợp', 'watch', ['Đen', 'Nâu']],
  ['Đồng hồ mặt tròn Minimal Time', 'WATCH', 'MAY', 799000, 'Hợp kim, kính khoáng, dây PU', 'watch', ['Đen', 'Be']],
  ['Đồng hồ nữ thanh lịch Slim', 'WATCH', 'LUA', 949000, 'Thép không gỉ, kính khoáng', 'watch', ['Đen', 'Vàng hồng']],
  ['Đồng hồ mặt vuông Urban Square', 'WATCH', 'URBAN', 1299000, 'Hợp kim, dây thép dạng lưới', 'squareWatch', ['Đen', 'Bạc']],
  ['Đồng hồ dây lưới City Mesh', 'WATCH', 'HEN', 1099000, 'Thép không gỉ, dây Milanese', 'squareWatch', ['Đen', 'Bạc', 'Vàng hồng']],
  ['Đồng hồ unisex Weekend Time', 'WATCH', 'SONG', 699000, 'Hợp kim, dây da tổng hợp', 'watch', ['Đen', 'Nâu café']],

  ['Giày chạy bộ Pace Run Lite', 'SPORT', 'PACE', 1199000, 'Mesh thoáng khí, đế EVA', 'sport', ['Xám neon', 'Đen']],
  ['Giày tập gym Flex Training', 'SPORT', 'PACE', 999000, 'Lưới kỹ thuật, cao su chống trượt', 'sport', ['Xám xanh', 'Đen cam']],
  ['Giày đi bộ Walk Cloud', 'SPORT', 'HEN', 899000, 'Mesh dệt, đế foam êm', 'sport', ['Xám neon', 'Trắng xanh']],
  ['Giày thể thao nữ Active Move', 'SPORT', 'PACE', 1099000, 'Mesh co giãn, đế EVA nhẹ', 'highTop', ['Xám hồng', 'Trắng tím']],
];

const clothingSizes = ['SIZE_S', 'SIZE_M', 'SIZE_L', 'SIZE_XL'];
const footwearSizes = [38, 39, 40, 41, 42].map(size => `DEMO_SIZE_${size}`);
const sizeGuides = {
  SIZE_S: ['46', '64', '45–55 kg'], SIZE_M: ['49', '67', '55–65 kg'],
  SIZE_L: ['52', '70', '65–75 kg'], SIZE_XL: ['55', '73', '75–85 kg'],
};
const supplierByCategory = {
  TSHIRT: 'may', SHIRT: 'may', DENIM: 'denim', PANTS: 'denim',
  SHOES: 'shoes', BAGS: 'bags', WATCH: 'watch', SPORT: 'sport',
};
const inactiveProductNumbers = new Set([8, 16, 32, 40]);
const outOfStockProductNumbers = new Set([12, 24, 36]);
const lowStockProductNumbers = new Set([5, 18, 29, 39]);

const products = productDefinitions.map(([name, category, brand, basePrice, material, imageFamily, colors], index) => {
  const number = index + 1;
  const key = `DEMO_P${String(number).padStart(3, '0')}`;
  const accessories = ['BAGS', 'WATCH'].includes(category);
  const footwear = ['SHOES', 'SPORT'].includes(category);
  const sizeCodes = accessories ? ['DEMO_SIZE_FREE'] : footwear ? footwearSizes : clothingSizes;
  const salePercent = [0, 10, 20, 25, 30][index % 5];
  const stockScenario = outOfStockProductNumbers.has(number) ? 'out-of-stock' : lowStockProductNumbers.has(number) ? 'low-stock' : 'in-stock';
  const content = [
    `${name} mang phong cách dễ kết hợp, phù hợp đi làm, đi học và các hoạt động hằng ngày.`,
    `Chất liệu: ${material}. Sản xuất tại Việt Nam. Màu sắc: ${colors.join(', ')}.`,
    'Chọn đúng màu và kích thước trước khi đặt hàng. Thông số trong bảng kích thước là hướng dẫn tham khảo cho dữ liệu mẫu.',
    'Bảo quản nơi khô thoáng; làm sạch nhẹ theo chất liệu. Với trang phục, giặt riêng màu ở lần giặt đầu và hạn chế sấy nhiệt cao.',
    'Dữ liệu và hình ảnh minh họa phục vụ kiểm thử chức năng của cửa hàng.',
  ];
  return {
    key,
    name,
    statusId: inactiveProductNumbers.has(number) ? 'S2' : 'S1',
    categoryId: `DEMO_CAT_${category}`,
    brandId: `DEMO_BRAND_${brand}`,
    material,
    madeby: 'Việt Nam',
    view: 25 + ((number * 113) % 2800),
    ageDays: 2 + ((number * 7) % 170),
    supplierKey: supplierByCategory[category],
    stockScenario,
    contentMarkdown: `## ${name}\n\n${content.join('\n\n')}`,
    contentHTML: `<h2>${name}</h2>${content.map(paragraph => `<p>${paragraph}</p>`).join('')}`,
    variants: colors.map((color, colorIndex) => {
      const originalPrice = basePrice + (colorIndex * 20000);
      const discountPrice = Math.round(originalPrice * (100 - salePercent) / 100 / 1000) * 1000;
      return {
        key: `${key}_V${colorIndex + 1}`,
        nameDetail: color,
        originalPrice,
        discountPrice,
        description: `${name}, màu ${color.toLowerCase()}. ${accessories ? 'Kích thước tiêu chuẩn, dễ sử dụng hằng ngày.' : footwear ? 'Phom tiêu chuẩn, chọn theo chiều dài bàn chân.' : 'Phom tiêu chuẩn, chọn theo bảng kích thước.'}`,
        images: media[imageFamily].map((path, imageIndex) => image(path, `${name} – ${color} – ảnh minh họa ${imageIndex + 1}`)),
        sizes: sizeCodes.map((sizeId, sizeIndex) => {
          const initialStock = stockScenario === 'out-of-stock' ? 0 : stockScenario === 'low-stock' ? 1 + ((colorIndex + sizeIndex) % 3) : (number % 7 === 0 && colorIndex === 1 && sizeIndex === 0) ? 0 : 35 + ((number * 3 + colorIndex * 7 + sizeIndex * 11) % 65);
          const guide = sizeGuides[sizeId] || (footwear ? [String(9 + sizeIndex * 0.2), String(24 + sizeIndex * 0.7), '0.65 kg / đôi'] : category === 'BAGS' ? ['30', '25', '0.45 kg'] : ['3.8', '24', '0.12 kg']);
          return {
            key: `${key}_V${colorIndex + 1}_${sizeId}`,
            sizeId,
            width: guide[0], height: guide[1], weight: guide[2],
            initialStock,
            costPrice: Math.round(originalPrice * 0.46 / 1000) * 1000,
          };
        }),
      };
    }),
  };
});

const banners = [
  { key: 'DEMO_BANNER_AUTUMN', name: 'Bộ sưu tập thu – Phong cách của bạn', description: 'Khám phá trang phục và phụ kiện cho mỗi ngày.', statusId: 'S1', ...image('banner/banner-bg.jpg', 'Bộ sưu tập mùa thu') },
  { key: 'DEMO_BANNER_WEEKEND', name: 'Ưu đãi cuối tuần', description: 'Nhiều sản phẩm giảm từ 10% đến 30%, đủ màu và kích thước.', statusId: 'S1', ...image('offer-bg.png', 'Ưu đãi thời trang cuối tuần') },
  { key: 'DEMO_BANNER_NEW', name: 'Hàng mới về – Mây Studio', description: 'Áo sơ mi, áo thun và quần jeans mới cho tủ đồ của bạn.', statusId: 'S1', ...image('banner/banner-bg.jpg', 'Hàng mới về') },
  { key: 'DEMO_BANNER_ARCHIVE', name: 'Chiến dịch mùa hè đã kết thúc', description: 'Banner mẫu ngừng hoạt động để kiểm tra danh sách quản trị.', statusId: 'S2', ...image('offer-bg.png', 'Chiến dịch lưu trữ') },
];

const blogDefinitions = [
  ['5 cách phối áo thun trắng cho cả tuần', 'STYLE', 'Áo thun trắng có thể phối cùng jeans, chino và giày sneaker để tạo các bộ đồ đơn giản.', ['Bắt đầu với quần jeans xanh và sneaker trắng cho ngày đi học hoặc đi chơi.', 'Khi đi làm, thêm áo sơ mi khoác ngoài và chọn quần chino có màu trung tính.', 'Thay túi xách và đồng hồ để thay đổi điểm nhấn mà vẫn giữ tổng thể gọn gàng.']],
  ['Chọn size áo vừa vặn khi mua online', 'GUIDE', 'Đo chiều rộng vai, vòng ngực và chiều dài áo để đối chiếu bảng kích thước của từng mẫu.', ['Dùng một chiếc áo đang mặc vừa, trải phẳng và đo chiều rộng thân cùng chiều dài.', 'Đối chiếu số đo với thông tin của từng màu và size trong trang chi tiết sản phẩm.', 'Nếu thích mặc rộng, cân nhắc tăng một size sau khi xem phom và độ co giãn của vải.']],
  ['Giữ quần jeans bền màu sau nhiều lần giặt', 'CARE', 'Một vài thói quen giặt và phơi giúp quần jeans giữ màu, hạn chế biến dạng.', ['Lộn trái quần, phân loại đồ cùng màu và ưu tiên nước mát.', 'Hạn chế ngâm lâu, dùng lượng chất giặt vừa đủ và tránh chà xát mạnh.', 'Phơi nơi thoáng, tránh nắng gắt chiếu trực tiếp vào bề mặt vải.']],
  ['Gợi ý tủ đồ công sở với gam màu trung tính', 'STYLE', 'Trắng, be, xám và xanh navy giúp các món đồ dễ kết hợp trong tuần.', ['Chọn hai chiếc áo sơ mi, một áo polo và hai chiếc quần có màu dễ kết hợp.', 'Sneaker đơn giản hoặc giày casual giúp di chuyển thoải mái.', 'Túi xách gọn và đồng hồ mặt tối giản hoàn thiện bộ đồ công sở.']],
  ['Phân biệt phom jeans slim, straight và wide leg', 'GUIDE', 'Hiểu phom quần giúp chọn được dáng mặc phù hợp và phối đồ dễ hơn.', ['Slim ôm nhẹ ở phần chân; straight có ống tương đối thẳng từ đùi xuống.', 'Wide leg có ống rộng, phù hợp khi muốn tạo tổng thể thoải mái.', 'Thử phối với áo gọn ở phần trên và điều chỉnh chiều dài gấu theo đôi giày.']],
  ['Vệ sinh giày sneaker tại nhà', 'CARE', 'Làm sạch từng phần của đôi giày để giữ bề mặt và hạn chế mùi.', ['Tháo dây giày, phủi bụi khô trước khi vệ sinh bằng khăn ẩm.', 'Với da tổng hợp, làm sạch nhẹ; với vải, thử dung dịch ở vùng nhỏ trước.', 'Để giày khô tự nhiên ở nơi thoáng, tránh máy sấy và nguồn nhiệt cao.']],
  ['Bộ sưu tập mới: Trang phục cho nhịp sống thành phố', 'NEWS', 'Các mẫu áo cơ bản, jeans và túi xách mới đã có trong dữ liệu cửa hàng.', ['Bộ sưu tập chọn màu trung tính cùng một số màu pastel làm điểm nhấn.', 'Mỗi mẫu có nhiều lựa chọn màu và size để kiểm tra thao tác mua hàng.', 'Xem danh mục hoặc tìm theo tên sản phẩm để khám phá các mẫu mới.']],
  ['Chọn túi xách cho đi học, đi làm và đi chơi', 'GUIDE', 'Cân nhắc kích thước, số đồ cần mang và cách đeo khi chọn một chiếc túi.', ['Túi tote phù hợp khi cần mang sách, sổ tay hoặc vật dụng hằng ngày.', 'Túi đeo vai và túi mini giúp bộ đồ nhẹ nhàng hơn khi đi chơi.', 'Kiểm tra chiều rộng, chiều cao và trọng lượng được ghi trong thông tin sản phẩm.']],
  ['Phối đồng hồ với trang phục hằng ngày', 'STYLE', 'Một chiếc đồng hồ đơn giản có thể trở thành điểm nhấn cho nhiều bộ đồ.', ['Dây đen hoặc nâu dễ phối với áo sơ mi, áo polo và jeans.', 'Mặt tối giản giữ tổng thể gọn; mặt vuông tạo cảm giác cá tính hơn.', 'Chọn độ rộng dây và màu kim loại phù hợp với phụ kiện đang sử dụng.']],
  ['Chọn giày cho đi bộ và tập luyện', 'GUIDE', 'Độ vừa chân, sự ổn định và chất liệu thoáng là các yếu tố nên kiểm tra.', ['Đo chân vào thời điểm thường sử dụng giày và đối chiếu chiều dài từng size.', 'Khi thử, kiểm tra khoảng trống ở mũi và độ bám của gót.', 'Đọc mô tả chất liệu và mục đích sử dụng để chọn mẫu phù hợp với hoạt động.']],
  ['Cách bảo quản túi da tổng hợp', 'CARE', 'Làm sạch nhẹ và giữ phom giúp túi luôn gọn gàng khi cất giữ.', ['Lau bằng khăn mềm hơi ẩm, sau đó để khô ở nơi thoáng.', 'Không nhồi quá nhiều đồ; dùng giấy sạch để giữ phom khi cất túi.', 'Cất ở nơi khô, tránh nắng trực tiếp và tránh để sát nguồn nhiệt.']],
  ['Bản nháp: Lịch ra mắt bộ sưu tập tiếp theo', 'NEWS', 'Bài viết ngừng hoạt động dùng để kiểm tra bộ lọc quản trị và trạng thái xuất bản.', ['Đây là nội dung minh họa phục vụ kiểm thử.', 'Các mẫu sản phẩm, màu sắc và kích thước sẽ được cập nhật trong danh mục.', 'Bài viết được đánh dấu ngừng hoạt động trong dữ liệu mẫu.']],
];

const blogs = blogDefinitions.map(([title, subject, shortdescription, paragraphs], index) => ({
  key: `DEMO_BLOG_${String(index + 1).padStart(2, '0')}`,
  title,
  shortdescription,
  subjectId: `DEMO_SUBJECT_${subject}`,
  statusId: index === blogDefinitions.length - 1 ? 'S2' : 'S1',
  authorRole: index % 3 === 0 ? 'R1' : 'R4',
  view: 90 + index * 87,
  ageDays: 4 + index * 9,
  contentMarkdown: `# ${title}\n\n${shortdescription}\n\n${paragraphs.map((paragraph, paragraphIndex) => `### ${paragraphIndex + 1}. Gợi ý thực hiện\n\n${paragraph}`).join('\n\n')}\n\n*Nội dung mẫu phục vụ kiểm thử cửa hàng.*`,
  contentHTML: `<h1>${title}</h1><p>${shortdescription}</p>${paragraphs.map((paragraph, paragraphIndex) => `<h3>${paragraphIndex + 1}. Gợi ý thực hiện</h3><p>${paragraph}</p>`).join('')}<p><em>Nội dung mẫu phục vụ kiểm thử cửa hàng.</em></p>`,
  ...image(`blog/main-blog/m-blog-${(index % 5) + 1}.jpg`, title),
}));

module.exports = { categories, brands, sizes, subjects, suppliers, shippingMethods, products, banners, blogs };
