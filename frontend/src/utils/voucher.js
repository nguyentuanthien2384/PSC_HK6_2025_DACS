const voucherDate = value => /^\d+$/.test(String(value)) ? Number(value) : new Date(value).getTime();

export const voucherAvailabilityError = (entry, subtotal, now = Date.now()) => {
  const voucher = entry?.voucherData;
  const rule = voucher?.typeVoucherOfVoucherData;
  if (!voucher || !rule) return 'Voucher không hợp lệ.';
  if (voucher.fromDate !== undefined && voucher.toDate !== undefined) {
    const from = voucherDate(voucher.fromDate);
    const to = new Date(voucherDate(voucher.toDate));
    to.setHours(23, 59, 59, 999);
    if (!Number.isFinite(from) || !Number.isFinite(to.getTime())) return 'Thời gian voucher không hợp lệ.';
    if (now < from) return 'Voucher chưa đến thời gian sử dụng.';
    if (now > to.getTime()) return 'Voucher đã hết hạn.';
  }
  if (voucher.amount !== undefined && Number(voucher.usedAmount || 0) >= Number(voucher.amount)) return 'Voucher đã hết lượt sử dụng.';
  if (Number(subtotal) < Number(rule.minValue || 0)) return `Giá trị sản phẩm chưa đạt mức tối thiểu ${Number(rule.minValue).toLocaleString('vi-VN')} ₫.`;
  return '';
};
