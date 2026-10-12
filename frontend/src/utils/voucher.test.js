import { voucherAvailabilityError } from './voucher';
import { discountedSubtotal } from './checkout';

const entry = changes => ({ voucherData: { amount: 10, usedAmount: 1,
    fromDate: String(new Date(2026, 9, 10).getTime()), toDate: String(new Date(2026, 9, 12).getTime()),
    typeVoucherOfVoucherData: { typeVoucher: 'percent', value: 10, minValue: 100000, maxValue: 20000 },
    ...changes,
} });

test('voucher remains available throughout the expiry calendar day and stops immediately after it', () => {
    expect(voucherAvailabilityError(entry(), 100000, new Date(2026, 9, 12, 23, 59, 59, 999).getTime())).toBe('');
    expect(voucherAvailabilityError(entry(), 100000, new Date(2026, 9, 13).getTime())).toMatch(/hết hạn/);
    expect(voucherAvailabilityError(entry(), 100000, new Date(2026, 9, 9).getTime())).toMatch(/chưa đến/);
});

test('voucher feedback distinguishes minimum spend, exhausted usage and invalid dates', () => {
    const now = new Date(2026, 9, 11).getTime();
    expect(voucherAvailabilityError(entry(), 99999, now)).toMatch(/100.000/);
    expect(voucherAvailabilityError(entry({ usedAmount: 10 }), 100000, now)).toMatch(/hết lượt/);
    expect(voucherAvailabilityError(entry({ toDate: 'bad' }), 100000, now)).toMatch(/không hợp lệ/);
});

test('an expired selected voucher cannot reduce the displayed cart estimate', () => {
    const voucher = entry({ fromDate: '1', toDate: '2' });
    expect(discountedSubtotal(100000, voucher)).toBe(100000);
});
