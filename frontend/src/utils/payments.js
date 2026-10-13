/* global BigInt */
export function isDemoPayment(record) {
    if (!record || typeof record !== 'object') return false;
    return record.isDemo === true || [record.providerPaymentId, record.providerRefundId]
        .some(value => typeof value === 'string' && /^DEMO-/i.test(value));
}

export function formatProviderAmount(record) {
    const value = record?.providerAmount;
    if (!['number', 'string'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) || !/^[A-Z]{3}$/.test(record.currency || '')) return null;
    if (typeof value === 'number' && (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER)) return null;
    if (record.provider === 'vnpay') {
        if (record.currency !== 'VND' || !/^\d+$/.test(String(value))) return null;
        const minorUnits = BigInt(String(value));
        if (minorUnits % 100n !== 0n) return null;
        return `${new Intl.NumberFormat('vi-VN').format(minorUnits / 100n)} VND`;
    }
    return `${value} ${record.currency}`;
}
