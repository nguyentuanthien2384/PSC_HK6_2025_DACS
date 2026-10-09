'use strict';

// These builders have no database or clock side effects. The seed runner supplies
// the current date and resolves descriptor keys to the inserted database ids.
const demoPassword = 'Demo@123456';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const names = [
  ['Nguyễn', 'Minh Anh'], ['Trần', 'Hoàng Nam'], ['Lê', 'Thu Hà'], ['Phạm', 'Quang Huy'],
  ['Hoàng', 'Ngọc Mai'], ['Vũ', 'Đức Long'], ['Đặng', 'Thanh Vy'], ['Bùi', 'Gia Bảo'],
  ['Đỗ', 'Khánh Linh'], ['Hồ', 'Tuấn Kiệt'], ['Ngô', 'Hồng Nhung'], ['Dương', 'Hải Đăng'],
  ['Lý', 'Phương Thảo'], ['Mai', 'Anh Tuấn'], ['Đinh', 'Bảo Trâm'], ['Võ', 'Minh Khang'],
  ['Phan', 'Thùy Dung'], ['Tạ', 'Thành Đạt'], ['Cao', 'Mỹ Duyên'], ['Tô', 'Quốc Khánh'],
  ['Hà', 'Trúc Chi'], ['Lâm', 'Hoài Phong'], ['Tống', 'Nhật Hạ'], ['Đoàn', 'Trung Hiếu'],
];
const cityAddresses = [
  '24 Nguyễn Trãi, Phường Bến Thành, TP. Hồ Chí Minh',
  '68 Cầu Giấy, Phường Cầu Giấy, Hà Nội',
  '15 Nguyễn Văn Linh, Phường Hải Châu, Đà Nẵng',
  '92 Lý Tự Trọng, Phường Ninh Kiều, Cần Thơ',
  '36 Lê Lợi, Phường Thuận Hóa, Huế',
  '110 Trần Phú, Phường Nha Trang, Khánh Hòa',
];

function timestamp(now) {
  const value = new Date(now).getTime();
  if (!Number.isFinite(value)) throw new TypeError('Demo builders require a valid now date.');
  return value;
}

function buildUsers(now) {
  const anchor = timestamp(now);
  const specs = [
    { key: 'admin', emailName: 'admin', firstName: 'Nguyễn', lastName: 'Quản Trị', roleId: 'R1' },
    { key: 'staff1', emailName: 'staff1', firstName: 'Trần', lastName: 'Hương Giang', roleId: 'R4' },
    { key: 'staff2', emailName: 'staff2', firstName: 'Lê', lastName: 'Đình Phúc', roleId: 'R4' },
    { key: 'shipper1', emailName: 'shipper1', firstName: 'Phạm', lastName: 'Văn Bình', roleId: 'R3' },
    { key: 'shipper2', emailName: 'shipper2', firstName: 'Võ', lastName: 'Hữu Tín', roleId: 'R3' },
    { key: 'shipper3', emailName: 'shipper3', firstName: 'Đặng', lastName: 'Ngọc Sơn', roleId: 'R3' },
    ...names.map(([firstName, lastName], index) => ({
      key: `customer${String(index + 1).padStart(2, '0')}`,
      emailName: `customer${String(index + 1).padStart(2, '0')}`,
      firstName, lastName, roleId: 'R2',
    })),
    { key: 'inactive', emailName: 'inactive', firstName: 'Lê', lastName: 'Khách Tạm Khóa', roleId: 'R2', statusId: 'S2' },
    { key: 'unverified', emailName: 'unverified', firstName: 'Trần', lastName: 'Khách Chưa Xác Thực', roleId: 'R2', isActiveEmail: false },
  ];
  return specs.map((spec, index) => ({
    key: spec.key,
    email: `${spec.emailName}@demo.dacs.test`,
    firstName: spec.firstName,
    lastName: spec.lastName,
    address: cityAddresses[index % cityAddresses.length],
    genderId: index % 3 === 0 ? 'F' : index % 3 === 1 ? 'M' : 'O',
    phonenumber: `089900${String(index + 1).padStart(4, '0')}`,
    dob: String(Date.UTC(1988 + index % 15, index % 12, 5 + index % 20)),
    roleId: spec.roleId,
    statusId: spec.statusId || 'S1',
    isActiveEmail: spec.isActiveEmail !== false,
    usertoken: '',
    createdAt: new Date(anchor - (280 - index * 2) * DAY),
    updatedAt: new Date(anchor - (index % 14) * DAY),
  }));
}

function buildVouchers(now) {
  const anchor = timestamp(now);
  const types = [
    { key: 'percent10', typeVoucher: 'percent', value: 10, minValue: 100000, maxValue: 30000 },
    { key: 'percent15', typeVoucher: 'percent', value: 15, minValue: 200000, maxValue: 60000 },
    { key: 'percent20', typeVoucher: 'percent', value: 20, minValue: 350000, maxValue: 100000 },
    { key: 'percent25', typeVoucher: 'percent', value: 25, minValue: 600000, maxValue: 150000 },
    { key: 'money15', typeVoucher: 'money', value: 15000, minValue: 80000, maxValue: 15000 },
    { key: 'money30', typeVoucher: 'money', value: 30000, minValue: 180000, maxValue: 30000 },
    { key: 'money50', typeVoucher: 'money', value: 50000, minValue: 300000, maxValue: 50000 },
    { key: 'money100', typeVoucher: 'money', value: 100000, minValue: 700000, maxValue: 100000 },
  ];
  const specs = [
    ['welcome10', 'percent10', 'DEMO-CHAO10', 120, 'active'],
    ['style15', 'percent15', 'DEMO-STYLE15', 90, 'active'],
    ['weekend20', 'percent20', 'DEMO-CUOITUAN20', 75, 'active'],
    ['vip25', 'percent25', 'DEMO-VIP25', 40, 'active'],
    ['save15', 'money15', 'DEMO-TIETKIEM15K', 100, 'active'],
    ['save30', 'money30', 'DEMO-GIAM30K', 90, 'active'],
    ['save50', 'money50', 'DEMO-GIAM50K', 60, 'active'],
    ['save100', 'money100', 'DEMO-GIAM100K', 35, 'active'],
    ['expired10', 'percent10', 'DEMO-HETHAN10', 50, 'expired'],
    ['expired30', 'money30', 'DEMO-HETHAN30K', 50, 'expired'],
    ['upcoming20', 'percent20', 'DEMO-SAPMO20', 100, 'upcoming'],
    ['exhausted15', 'money15', 'DEMO-HETLUOT15K', 4, 'exhausted'],
  ];
  const vouchers = specs.map(([key, typeKey, codeVoucher, amount, state], index) => {
    const from = state === 'upcoming' ? anchor + 7 * DAY : anchor - 365 * DAY;
    const to = state === 'expired' ? anchor - 7 * DAY : anchor + (state === 'upcoming' ? 60 : 120) * DAY;
    return {
      key, typeKey, state, codeVoucher, amount,
      fromDate: String(from),
      toDate: String(to),
      createdAt: new Date(anchor - (370 - index) * DAY),
      updatedAt: new Date(anchor - (index % 7) * DAY),
    };
  });
  return { types, vouchers };
}

function addressesFor(addresses, customerId) {
  const value = addresses instanceof Map ? addresses.get(customerId) || addresses.get(String(customerId))
    : Array.isArray(addresses) ? addresses.filter(address => Number(address.userId) === Number(customerId))
      : addresses && (addresses[customerId] || addresses[String(customerId)]);
  return (Array.isArray(value) ? value : value ? [value] : []).filter(address => address && address.id);
}

function dateValue(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : new Date(value).getTime();
}

function buildOrders({ now, customers, addresses, shippingMethods, vouchers = [], variants, shippers }) {
  const anchor = timestamp(now);
  const buyers = (customers || []).filter(user => user.id && (!user.roleId || user.roleId === 'R2') && (!user.statusId || user.statusId === 'S1') && user.isActiveEmail !== false);
  const couriers = (shippers || []).filter(user => user.id && (!user.roleId || user.roleId === 'R3') && (!user.statusId || user.statusId === 'S1'));
  const products = (variants || []).filter(variant => variant.id && (!variant.statusId || variant.statusId === 'S1') && !/out|empty|zero|exhaust|low/i.test(variant.stockMode || '') && (variant.initialStock === undefined || Number(variant.initialStock) > 0));
  if (!buyers.length || !products.length || !(shippingMethods || []).length || !couriers.length) {
    throw new Error('Demo orders require active customers, stocked variants, shipping methods, and shippers.');
  }
  const voucherUses = new Set();
  const statusByIndex = index => index < 60 ? 'S6' : index < 72 ? 'S3' : index < 80 ? 'S4' : index < 88 ? 'S5' : 'S7';
  return Array.from({ length: 96 }, (_, index) => {
    const key = index + 1;
    const statusId = statusByIndex(index);
    const customer = buyers[index % buyers.length];
    const customerAddresses = addressesFor(addresses, customer.id);
    if (!customerAddresses.length) throw new Error(`Demo customer ${customer.id} has no delivery address.`);
    const address = customerAddresses[index % customerAddresses.length];
    const shipping = shippingMethods[index % shippingMethods.length];
    const age = statusId === 'S6' ? Math.floor(index * 179 / 59) : statusId === 'S3' ? (index - 60) % 3 : (index % 7);
    const updatedAt = new Date(anchor - age * DAY - (index % 5) * HOUR);
    const createdAt = new Date(updatedAt.getTime() - (statusId === 'S3' ? 0 : 1 + index % 4) * DAY);
    const count = Math.min(1 + index % 4, products.length);
    const lines = Array.from({ length: count }, (_, lineIndex) => {
      const variant = products[(index * 7 + lineIndex * 5) % products.length];
      return { productId: variant.id, quantity: 1 + (index + lineIndex) % 3, realPrice: Number(variant.price) };
    });
    // Keep one line per variant even when the chosen catalogue size shares a
    // divisor with the stride above, mirroring checkout line normalization.
    const normalizedLines = [...lines.reduce((byVariant, line) => {
      const existing = byVariant.get(line.productId);
      if (existing) existing.quantity += line.quantity;
      else byVariant.set(line.productId, { ...line });
      return byVariant;
    }, new Map()).values()];
    const subtotal = normalizedLines.reduce((sum, line) => sum + line.quantity * line.realPrice, 0);
    const eligibleVouchers = index % 3 === 0 ? vouchers.filter(voucher => {
      const type = voucher.typeVoucherOfVoucherData || voucher.typeData || voucher;
      return voucher.id && (!voucher.state || voucher.state === 'active')
        && dateValue(voucher.fromDate) <= createdAt.getTime() && dateValue(voucher.toDate) >= createdAt.getTime()
        && subtotal >= Number(type.minValue || 0)
        && !voucherUses.has(`${customer.id}:${voucher.id}`);
    }) : [];
    // Four historical purchases explain why this voucher has no uses left.
    const exhaustedVoucher = [2, 5, 8, 11].includes(index) ? vouchers.find(voucher => {
      const type = voucher.typeVoucherOfVoucherData || voucher.typeData || voucher;
      return voucher.id && voucher.state === 'exhausted'
        && dateValue(voucher.fromDate) <= createdAt.getTime() && dateValue(voucher.toDate) >= createdAt.getTime()
        && subtotal >= Number(type.minValue || 0)
        && !voucherUses.has(`${customer.id}:${voucher.id}`);
    }) : null;
    const voucher = exhaustedVoucher || (eligibleVouchers.length ? eligibleVouchers[Math.floor(index / 3) % eligibleVouchers.length] : null);
    if (voucher) voucherUses.add(`${customer.id}:${voucher.id}`);
    return {
      key,
      customerId: customer.id,
      addressUserId: address.id,
      statusId,
      typeShipId: shipping.id,
      voucherId: voucher ? voucher.id : null,
      note: `[DEMO DACS v1] Đơn mẫu #${String(key).padStart(3, '0')}`,
      isPaymentOnlien: statusId === 'S6' && index % 3 === 1 ? 1 : 0,
      shipperId: ['S5', 'S6'].includes(statusId) ? couriers[index % couriers.length].id : null,
      createdAt,
      updatedAt,
      lines: normalizedLines,
    };
  });
}

module.exports = { demoPassword, buildUsers, buildVouchers, buildOrders };
