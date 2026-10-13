const crypto = require('crypto');
const moment = require('moment');
const { Op } = require('sequelize');
const { createCommerceService } = require('./commerceService');
const { CommerceError, fail, positiveInteger, resultOf, verifyVnpay } = require('../utils/commerce');

// VNPay 2.1.0 querydr/refund signs a pipe-delimited payload, unlike payment/IPN.
const VNP_QUERY_REQUEST = ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_TransactionDate', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'];
const VNP_REFUND_REQUEST = ['vnp_RequestId', 'vnp_Version', 'vnp_Command', 'vnp_TmnCode', 'vnp_TransactionType', 'vnp_TxnRef', 'vnp_Amount', 'vnp_TransactionNo', 'vnp_TransactionDate', 'vnp_CreateBy', 'vnp_CreateDate', 'vnp_IpAddr', 'vnp_OrderInfo'];
const VNP_RESPONSE = ['vnp_ResponseId', 'vnp_Command', 'vnp_ResponseCode', 'vnp_Message', 'vnp_TmnCode', 'vnp_TxnRef', 'vnp_Amount', 'vnp_BankCode', 'vnp_PayDate', 'vnp_TransactionNo', 'vnp_TransactionType', 'vnp_TransactionStatus', 'vnp_OrderInfo'];
const signVnpayApi = (data, fields, secret) => crypto.createHmac('sha512', secret).update(fields.map(name => data[name] == null ? '' : String(data[name])).join('|'), 'utf8').digest('hex');
function verifyVnpayApi(data, command, secret) {
    if (!secret || typeof data.vnp_SecureHash !== 'string' || !/^[a-f\d]{128}$/i.test(data.vnp_SecureHash)) return false;
    const fields = command === 'querydr' ? [...VNP_RESPONSE, 'vnp_PromotionCode', 'vnp_PromotionAmount'] : VNP_RESPONSE;
    return crypto.timingSafeEqual(Buffer.from(signVnpayApi(data, fields, secret), 'hex'), Buffer.from(data.vnp_SecureHash, 'hex'));
}
const dateFormat = date => moment(date).utcOffset(7).format('YYYYMMDDHHmmss');
const plain = row => row && (row.get ? row.get({ plain: true }) : { ...row });
const parse = value => { try { return JSON.parse(value || '{}'); } catch (_) { return {}; } };
const admin = actor => actor && ['R1', 'R4'].includes(actor.roleId);
const isDemoSession = session => typeof session?.providerPaymentId === 'string' && session.providerPaymentId.startsWith('DEMO-');
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
const providerId = value => typeof value === 'string' && /^[a-z\d-]{1,100}$/i.test(value);
const minorUnits = (value, currency) => currency === 'VND' ? BigInt(String(value)) : BigInt(String(value).split('.')[0]) * 100n + BigInt((String(value).split('.')[1] || '').padEnd(2, '0'));
function sameAmount(left, right, currency) {
    const pattern = currency === 'VND' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
    if (!pattern.test(String(left)) || !pattern.test(String(right))) return false;
    return minorUnits(left, currency) === minorUnits(right, currency);
}

function createPaymentGatewayService(db, dependencies = {}) {
    const env = dependencies.env || process.env;
    const commerce = dependencies.commerce || createCommerceService(db);
    const now = dependencies.now || (() => new Date());
    const fetcher = dependencies.fetch || global.fetch;
    const lock = tx => commerce.lockOptions(tx);
    const options = tx => tx ? { transaction: tx } : {};
    const vnpConfigured = () => !!env.VNP_TMNCODE && !!env.VNP_HASHSECRET && env.VNP_HASHSECRET !== 'SECRETKEY';
    const paypalConfigured = () => !!env.PAYPAL_CLIENT_ID && !!env.PAYPAL_CLIENT_SECRET;
    const paypalBase = () => env.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
    let tokenCache;
    async function jsonRequest(url, init) {
        const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(20000) });
        const body = await response.json();
        if (!response.ok) {
            const error = new Error('Cổng thanh toán chưa trả kết quả hợp lệ. Vui lòng đối soát lại.');
            error.gatewayStatus = response.status;
            throw error;
        }
        return body;
    }
    async function paypalRequest(path, { method = 'GET', body, requestId } = {}) {
        if (!paypalConfigured()) fail('PayPal chưa được cấu hình tài khoản sandbox.', 3);
        if (!tokenCache || tokenCache.expiresAt <= now().getTime()) {
            const token = await jsonRequest(`${paypalBase()}/v1/oauth2/token`, {
                method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'grant_type=client_credentials'
            });
            if (!token.access_token) fail('PayPal chưa cấp token truy cập hợp lệ.', 3);
            if (!Number.isFinite(Number(token.expires_in || 300)) || Number(token.expires_in || 300) <= 0) fail('PayPal trả thời hạn token không hợp lệ.', 3);
            tokenCache = { value: token.access_token, expiresAt: now().getTime() + Math.max(0, Number(token.expires_in || 300) - 60) * 1000 };
        }
        return jsonRequest(`${paypalBase()}${path}`, { method,
            headers: { Authorization: `Bearer ${tokenCache.value}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
    }
    async function vnpRequest(data, command) {
        if (!vnpConfigured()) fail('VNPay chưa được cấu hình tài khoản sandbox.', 3);
        data.vnp_SecureHash = signVnpayApi(data, command === 'refund' ? VNP_REFUND_REQUEST : VNP_QUERY_REQUEST, env.VNP_HASHSECRET);
        const response = await jsonRequest(env.VNP_API_URL || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        if (!response || Object.entries(response).some(([name, value]) => name.startsWith('vnp_') && value != null && !['string', 'number'].includes(typeof value)) ||
            !verifyVnpayApi(response, command, env.VNP_HASHSECRET) || response.vnp_TmnCode !== env.VNP_TMNCODE || response.vnp_TxnRef !== data.vnp_TxnRef || (response.vnp_Command && response.vnp_Command !== command)) {
            fail('Phản hồi đối soát VNPay có chữ ký hoặc mã giao dịch không hợp lệ.', 3);
        }
        return response;
    }
    function queryData(session) {
        return { vnp_RequestId: crypto.randomUUID().replace(/-/g, ''), vnp_Version: '2.1.0', vnp_Command: 'querydr', vnp_TmnCode: env.VNP_TMNCODE,
            vnp_TxnRef: session.id, vnp_TransactionDate: session.gatewayTransactionDate || dateFormat(session.createdAt),
            vnp_CreateDate: dateFormat(now()), vnp_IpAddr: env.PAYMENT_SERVER_IP || '127.0.0.1', vnp_OrderInfo: `Doi soat ${session.id}` };
    }
    function vnpEvidence(data, source) {
        if (data.vnp_TransactionStatus === '00' && (!/^\d{1,15}$/.test(data.vnp_TransactionNo || '') || /^0+$/.test(data.vnp_TransactionNo))) fail('VNPay thiếu mã giao dịch đã thanh toán.', 3);
        return { paid: data.vnp_ResponseCode === '00' && data.vnp_TransactionStatus === '00', transactionId: `vnpay:${data.vnp_TransactionNo}`,
            amount: String(data.vnp_Amount), currency: 'VND', responseCode: data.vnp_ResponseCode,
            transactionStatus: data.vnp_TransactionStatus, payDate: data.vnp_PayDate, source, verifiedAt: now().toISOString() };
    }
    function paypalEvidence(payment, session, source, eventId) {
        if (session.gatewayApiVersion === 'v2') {
            if (!payment || payment.id !== session.providerPaymentId || !Array.isArray(payment.purchase_units) || payment.purchase_units.length !== 1) fail('PayPal không khớp phiên thanh toán.', 3);
            const unit = payment.purchase_units[0];
            if (unit.custom_id !== session.id || !unit.amount || unit.amount.currency_code !== session.currency || !sameAmount(unit.amount.value, session.providerAmount, session.currency)) fail('PayPal không khớp số tiền và loại tiền đã đặt.', 3);
            const captures = unit.payments && unit.payments.captures;
            if (payment.status !== 'COMPLETED' || !Array.isArray(captures) || captures.length !== 1) fail('PayPal chưa xác nhận thu tiền hoàn tất.', 3);
            const capture = captures[0];
            if (!providerId(capture.id) || capture.status !== 'COMPLETED' || !capture.amount || capture.amount.currency_code !== session.currency || !sameAmount(capture.amount.value, session.providerAmount, session.currency)) fail('PayPal chưa xác nhận đúng số tiền đã thu.', 3);
            return { paid: true, transactionId: payment.id, saleId: capture.id, amount: capture.amount.value, currency: capture.amount.currency_code,
                source, eventId, apiVersion: 'v2', verifiedAt: now().toISOString() };
        }
        const transactions = payment.transactions;
        if (payment.id !== session.providerPaymentId || !Array.isArray(transactions) || transactions.length !== 1) fail('PayPal không khớp phiên thanh toán.', 3);
        const transaction = transactions[0];
        if (transaction.custom !== session.id || !transaction.amount || transaction.amount.currency !== session.currency || !sameAmount(transaction.amount.total, session.providerAmount, session.currency)) fail('PayPal không khớp số tiền và loại tiền đã đặt.', 3);
        const sales = (transaction.related_resources || []).map(resource => resource.sale).filter(Boolean);
        // A payer approval alone does not establish settled funds.
        const sale = sales.find(row => row.state === 'completed');
        if (payment.state !== 'approved' || !sale || !sale.id || !sale.amount || sale.amount.currency !== session.currency || !sameAmount(sale.amount.total, session.providerAmount, session.currency)) fail('PayPal chưa xác nhận giao dịch bán hàng hoàn tất.', 3);
        return { paid: true, transactionId: payment.id, saleId: sale.id, amount: sale.amount.total, currency: sale.amount.currency,
            source, eventId, verifiedAt: now().toISOString() };
    }

    async function finalizeVerified(sessionId, provider, evidence, ownerId) {
        try { return await commerce.transaction(async tx => {
            const session = await db.PaymentSession.findOne({ where: { id: sessionId, provider }, ...lock(tx), raw: false });
            if (!session || (ownerId !== undefined && String(session.userId) !== String(ownerId))) fail('Không tìm thấy phiên thanh toán của bạn.', 403);
            if (evidence.currency !== session.currency || !sameAmount(evidence.amount, session.providerAmount, session.currency)) fail('Số tiền thanh toán không khớp đơn hàng.', 3, { gatewayError: 'AMOUNT' });
            if (session.providerPaymentId && session.providerPaymentId !== evidence.transactionId) fail('Mã giao dịch không khớp phiên thanh toán.', 3);
            const previous = parse(session.gatewayOutcome);
            if (session.status === 'REFUNDED') return { errCode: 0, status: session.status, duplicate: true, errMessage: 'Phiên thanh toán này đã được hoàn tiền.' };
            if (session.orderId) {
                return { errCode: 0, status: session.status, duplicate: true, orderId: session.orderId, errMessage: 'Đơn hàng đã được xác nhận.', data: await db.OrderProduct.findOne({ where: { id: session.orderId }, ...options(tx), raw: true }) };
            }
            // Never overwrite captured-payment evidence with a later failed/cancelled notice.
            if (previous.paid && !evidence.paid) return { errCode: 0, status: session.status, duplicate: true, errMessage: 'Đã lưu kết quả thanh toán thành công để đối soát.' };
            session.gatewayOutcome = JSON.stringify(evidence);
            session.lastCheckedAt = now();
            session.lastError = null;
            if (!evidence.paid) {
                session.status = ['04', '07'].includes(evidence.transactionStatus) || evidence.responseCode === '07' ? 'REVIEW_REQUIRED' : (evidence.transactionStatus === '01' ? 'PENDING' : 'FAILED');
                session.reviewReason = session.status === 'REVIEW_REQUIRED' ? 'Cổng thanh toán yêu cầu đối soát giao dịch đảo hoặc nghi ngờ.' : null;
                await session.save(options(tx));
                return { errCode: 2, status: session.status, errMessage: 'Giao dịch chưa thanh toán thành công.' };
            }
            session.providerPaymentId = evidence.transactionId;
            session.gatewaySaleId = evidence.saleId || session.gatewaySaleId;
            session.paidAt = session.paidAt || now();
            let reason;
            if (session.status !== 'PENDING' || new Date(session.expiresAt).getTime() <= now().getTime()) {
                reason = 'Tiền đã được cổng thanh toán xác nhận sau khi phiên hết hạn hoặc cần đối soát.';
            } else {
                try {
                    const checkout = JSON.parse(session.checkoutData);
                    await commerce.checkStock(checkout.lines, tx, session.id);
                    const address = await db.AddressUser.findOne({ where: { id: checkout.addressUserId, userId: session.userId }, ...options(tx), raw: true });
                    if (!address) fail('Địa chỉ giao hàng không còn tồn tại.', 2);
                    await commerce.checkVoucher(checkout.voucherId, session.userId, checkout.subtotal, tx, session.id);
                } catch (error) {
                    if (!(error instanceof CommerceError)) throw error;
                    reason = error.message;
                }
            }
            if (reason) {
                session.status = 'REVIEW_REQUIRED';
                session.reviewReason = reason;
                await session.save(options(tx));
                return { errCode: 2, status: session.status, errMessage: 'Đã ghi nhận thanh toán. Cửa hàng đang đối soát trước khi xử lý đơn hàng.', checkoutToken: session.id };
            }
            const result = await commerce.persistOrder(JSON.parse(session.checkoutData), tx, true);
            session.status = 'COMPLETED';
            session.orderId = result.orderId;
            session.reviewReason = null;
            await session.save(options(tx));
            return { ...result, status: 'COMPLETED' };
        }); } catch (error) {
            if (!evidence.paid || error instanceof CommerceError || error.name === 'SequelizeUniqueConstraintError') throw error;
            // A successful capture must remain visible if order/event persistence fails.
            // The failed order transaction was rolled back; keep settlement for review.
            return commerce.transaction(async tx => {
                const session = await db.PaymentSession.findOne({ where: { id: sessionId, provider }, ...lock(tx), raw: false });
                if (!session || (ownerId !== undefined && String(session.userId) !== String(ownerId)) || evidence.currency !== session.currency || !sameAmount(evidence.amount, session.providerAmount, session.currency) ||
                    (session.providerPaymentId && session.providerPaymentId !== evidence.transactionId)) throw error;
                if (session.orderId || session.status === 'REFUNDED') return { errCode: 0, status: session.status, orderId: session.orderId, duplicate: true };
                Object.assign(session, { gatewayOutcome: JSON.stringify(evidence), providerPaymentId: evidence.transactionId,
                    gatewaySaleId: evidence.saleId || session.gatewaySaleId, paidAt: session.paidAt || now(), status: 'REVIEW_REQUIRED',
                    lastCheckedAt: now(), reviewReason: 'Đã xác nhận thu tiền nhưng chưa lưu được đơn hàng. Cửa hàng cần đối soát trước khi giao hoặc hoàn tiền.' });
                await session.save(options(tx));
                return { errCode: 2, status: session.status, checkoutToken: session.id, errMessage: session.reviewReason };
            });
        }
    }

    function validateVnpayNotice(data) {
        if (!vnpConfigured()) fail('VNPay chưa được cấu hình.', 3);
        if (Object.entries(data).some(([name, value]) => name.startsWith('vnp_') && typeof value !== 'string') || !verifyVnpay(data, env.VNP_HASHSECRET) || data.vnp_TmnCode !== env.VNP_TMNCODE) fail('Chữ ký giao dịch VNPay không hợp lệ.', 3);
        if (!/^[\w-]{1,100}$/.test(data.vnp_TxnRef || '') || !/^\d{1,12}$/.test(data.vnp_Amount || '') || !/^\d{2}$/.test(data.vnp_ResponseCode || '') || !/^\d{2}$/.test(data.vnp_TransactionStatus || '')) fail('Dữ liệu giao dịch VNPay không hợp lệ.', 3);
        if (data.vnp_ResponseCode === '00' && data.vnp_TransactionStatus === '00' && (!/^\d{1,15}$/.test(data.vnp_TransactionNo || '') || /^0+$/.test(data.vnp_TransactionNo))) fail('Mã giao dịch VNPay không hợp lệ.', 3);
    }
    const completeVnpay = data => resultOf(async () => {
        validateVnpayNotice(data);
        if (!positiveInteger(data.userId) || data.checkoutToken !== data.vnp_TxnRef) fail('Thiếu phiên thanh toán hợp lệ.', 403);
        return finalizeVerified(data.vnp_TxnRef, 'vnpay', vnpEvidence(data, 'browser-return'), data.userId);
    });
    async function vnpayIpn(data) {
        try {
            try { validateVnpayNotice(data); } catch (_) { return { RspCode: '97', Message: 'Invalid signature' }; }
            const session = await db.PaymentSession.findOne({ where: { id: data.vnp_TxnRef, provider: 'vnpay' }, raw: true });
            if (!session) return { RspCode: '01', Message: 'Order not found' };
            if (!sameAmount(data.vnp_Amount, session.providerAmount, session.currency)) return { RspCode: '04', Message: 'Invalid amount' };
            const result = await finalizeVerified(session.id, 'vnpay', vnpEvidence(data, 'ipn'));
            return result.duplicate ? { RspCode: '02', Message: 'Order already confirmed' } : { RspCode: '00', Message: 'Confirm Success' };
        } catch (_) { return { RspCode: '99', Message: 'Unknown error' }; }
    }
    async function createPaypalPayment(session, returnUrl, cancelUrl) {
        const payment = await paypalRequest('/v2/checkout/orders', { method: 'POST', requestId: session.id, body: {
            intent: 'CAPTURE', purchase_units: [{ reference_id: session.id, custom_id: session.id, description: 'Thanh toan don hang',
                amount: { currency_code: session.currency, value: session.providerAmount } }],
            payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'PAY_NOW' } } }
        } });
        const approval = payment.links && payment.links.find(link => ['payer-action', 'approve'].includes(link.rel));
        if (!providerId(payment.id) || !approval || typeof approval.href !== 'string') fail('PayPal chưa trả địa chỉ phê duyệt hợp lệ.', 3);
        const url = new URL(approval.href);
        if (url.protocol !== 'https:' || !['www.paypal.com', 'www.sandbox.paypal.com', 'paypal.com', 'sandbox.paypal.com'].includes(url.hostname)) fail('Địa chỉ thanh toán PayPal không hợp lệ.', 3);
        return { id: payment.id, approvalUrl: approval.href };
    }
    const completePaypal = data => resultOf(async () => {
        const paymentId = data.paymentId || data.token;
        if (!uuid(data.checkoutToken) || !positiveInteger(data.userId) || !providerId(paymentId)) fail('Thiếu phiên xác nhận PayPal hợp lệ.');
        const session = await db.PaymentSession.findOne({ where: { id: data.checkoutToken, userId: data.userId, provider: 'paypal' }, raw: true });
        if (!session || session.providerPaymentId !== paymentId) fail('PayPal không khớp phiên thanh toán.', 403);
        if (isDemoSession(session)) fail('Giao dịch dữ liệu mẫu không thể xác nhận với cổng thanh toán.', 2);
        if (session.gatewayApiVersion === 'v2') {
            let payment = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paymentId)}`);
            if (payment.status !== 'COMPLETED') {
                const unit = payment.purchase_units && payment.purchase_units[0];
                if (payment.id !== paymentId || !Array.isArray(payment.purchase_units) || payment.purchase_units.length !== 1 || !unit || unit.custom_id !== session.id || !unit.amount || unit.amount.currency_code !== session.currency || !sameAmount(unit.amount.value, session.providerAmount, session.currency)) fail('PayPal không khớp phiên và giá trị thanh toán.', 3);
                if (payment.status !== 'APPROVED') fail('Khách hàng chưa phê duyệt thanh toán PayPal.', 2);
                if (session.status !== 'PENDING' || new Date(session.expiresAt).getTime() <= now().getTime()) fail('Phiên thanh toán đã hết hạn. Vui lòng đặt lại đơn; hệ thống chưa thu tiền.', 2);
                // Capture uses another key than create, and retries always use this same key.
                const requestId = crypto.createHash('sha256').update(`capture:${session.id}`).digest('hex').slice(0, 36);
                try { payment = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paymentId)}/capture`, { method: 'POST', requestId, body: {} }); }
                catch (error) {
                    // An ambiguous HTTP result can already have captured funds. Read authoritative state.
                    payment = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(paymentId)}`);
                    if (payment.status !== 'COMPLETED') throw error;
                }
            }
            return finalizeVerified(session.id, 'paypal', paypalEvidence(payment, session, 'browser-return'), data.userId);
        }
        if (!providerId(data.PayerID)) fail('Thiếu mã người thanh toán PayPal hợp lệ.');
        let payment = await paypalRequest(`/v1/payments/payment/${encodeURIComponent(session.providerPaymentId)}`);
        if (payment.state !== 'approved') {
            const unit = payment.transactions && payment.transactions[0];
            if (payment.id !== paymentId || !Array.isArray(payment.transactions) || payment.transactions.length !== 1 || !unit || unit.custom !== session.id || !unit.amount || unit.amount.currency !== session.currency || !sameAmount(unit.amount.total, session.providerAmount, session.currency)) fail('PayPal không khớp phiên và giá trị thanh toán.', 3);
            if (session.status !== 'PENDING' || new Date(session.expiresAt).getTime() <= now().getTime()) fail('Phiên thanh toán đã hết hạn. Hệ thống chưa thu tiền.', 2);
            payment = await paypalRequest(`/v1/payments/payment/${encodeURIComponent(session.providerPaymentId)}/execute`, { method: 'POST', requestId: session.id, body: { payer_id: data.PayerID } });
        }
        return finalizeVerified(session.id, 'paypal', paypalEvidence(payment, session, 'browser-return'), data.userId);
    });

    async function paypalWebhook(headers, event) {
        if (!env.PAYPAL_WEBHOOK_ID) fail('Chưa cấu hình PAYPAL_WEBHOOK_ID để xác thực thông báo.', 3);
        const signature = { webhook_id: env.PAYPAL_WEBHOOK_ID, webhook_event: event };
        for (const [key, header] of Object.entries({ auth_algo: 'paypal-auth-algo', cert_url: 'paypal-cert-url', transmission_id: 'paypal-transmission-id', transmission_sig: 'paypal-transmission-sig', transmission_time: 'paypal-transmission-time' })) {
            const value = headers[header];
            if (typeof value !== 'string' || !value || value.length > 1000) fail('Thiếu chữ ký thông báo PayPal.', 403);
            signature[key] = value;
        }
        if (!event || !providerId(event.id) || !event.resource || !providerId(event.resource.id)) fail('Thông báo PayPal không hợp lệ.', 403);
        let cert;
        try { cert = new URL(signature.cert_url); } catch (_) { fail('Địa chỉ chứng chỉ PayPal không hợp lệ.', 403); }
        if (cert.protocol !== 'https:' || !['api.paypal.com', 'api-m.paypal.com', 'api.sandbox.paypal.com', 'api-m.sandbox.paypal.com'].includes(cert.hostname) || !cert.pathname.startsWith('/v1/notifications/certs/')) fail('Địa chỉ chứng chỉ PayPal không hợp lệ.', 403);
        const verification = await paypalRequest('/v1/notifications/verify-webhook-signature', { method: 'POST', body: signature });
        if (verification.verification_status !== 'SUCCESS') fail('Chữ ký thông báo PayPal không hợp lệ.', 403);
        if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const capture = await paypalRequest(`/v2/payments/captures/${encodeURIComponent(event.resource.id)}`);
            const orderId = capture.supplementary_data && capture.supplementary_data.related_ids && capture.supplementary_data.related_ids.order_id;
            if (capture.id !== event.resource.id || capture.status !== 'COMPLETED' || !providerId(orderId)) fail('PayPal chưa xác nhận giao dịch thu tiền hoàn tất.', 3);
            const session = await db.PaymentSession.findOne({ where: { provider: 'paypal', providerPaymentId: orderId, gatewayApiVersion: 'v2' }, raw: true });
            if (!session) fail('Không tìm thấy phiên thanh toán PayPal.', 2);
            const payment = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
            const evidence = paypalEvidence(payment, session, 'webhook', event.id);
            if (evidence.saleId !== capture.id || !capture.amount || capture.amount.currency_code !== session.currency || !sameAmount(capture.amount.value, session.providerAmount, session.currency)) fail('Thông báo PayPal không khớp giao dịch đã thu.', 3);
            return finalizeVerified(session.id, 'paypal', evidence);
        }
        if (event.event_type === 'PAYMENT.SALE.COMPLETED') {
            const sale = await paypalRequest(`/v1/payments/sale/${encodeURIComponent(event.resource.id)}`);
            if (!sale.parent_payment || sale.state !== 'completed' || sale.id !== event.resource.id) fail('PayPal chưa xác nhận giao dịch hoàn tất.', 3);
            const session = await db.PaymentSession.findOne({ where: { provider: 'paypal', providerPaymentId: sale.parent_payment }, raw: true });
            if (!session) fail('Không tìm thấy phiên thanh toán PayPal.', 2);
            const payment = await paypalRequest(`/v1/payments/payment/${encodeURIComponent(sale.parent_payment)}`);
            const evidence = paypalEvidence(payment, session, 'webhook', event.id);
            if (evidence.saleId !== sale.id) fail('Thông báo PayPal không khớp giao dịch của đơn hàng.', 3);
            return finalizeVerified(session.id, 'paypal', evidence);
        }
        if (['PAYMENT.SALE.REFUNDED', 'PAYMENT.CAPTURE.REFUNDED'].includes(event.event_type)) {
            const refund = await db.PaymentRefund.findOne({ where: { provider: 'paypal', providerRefundId: event.resource.id }, raw: true });
            if (refund) return retryRefund(refund.id);
            if (event.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
                const result = await paypalRequest(`/v2/payments/refunds/${encodeURIComponent(event.resource.id)}`);
                if (result.id !== event.resource.id) fail('Thông báo hoàn tiền PayPal không khớp giao dịch.', 3);
                const registered = uuid(result.custom_id) ? await db.PaymentRefund.findOne({ where: { id: result.custom_id, provider: 'paypal' }, raw: true }) : null;
                if (registered) {
                    const session = await db.PaymentSession.findOne({ where: { id: registered.sessionId }, raw: true });
                    return settlePaypalRefund(registered, session.gatewaySaleId, result, 'v2');
                }
                const captureId = refundCaptureId(result);
                if (captureId) await db.PaymentSession.update({ status: 'REVIEW_REQUIRED', reviewReason: 'PayPal xác nhận hoàn tiền ngoài hệ thống. Cần đối soát với đơn hàng.' }, { where: { provider: 'paypal', gatewaySaleId: captureId } });
                return { errCode: 0, ignored: true };
            }
            // A provider-dashboard refund needs staff review rather than assuming fulfillment state.
            const saleId = event.resource.sale_id;
            if (saleId) await db.PaymentSession.update({ status: 'REVIEW_REQUIRED', reviewReason: 'Nhận thông báo hoàn tiền ngoài hệ thống. Cần đối soát với PayPal.' }, { where: { provider: 'paypal', gatewaySaleId: saleId } });
        }
        if (['PAYMENT.CAPTURE.REVERSED', 'PAYMENT.SALE.REVERSED'].includes(event.event_type)) {
            const version = event.event_type.startsWith('PAYMENT.CAPTURE.') ? 'v2' : 'v1';
            const capture = await paypalRequest(version === 'v2' ? `/v2/payments/captures/${encodeURIComponent(event.resource.id)}` : `/v1/payments/sale/${encodeURIComponent(event.resource.id)}`);
            if (capture.id !== event.resource.id) fail('Thông báo đảo giao dịch không khớp.', 3);
            await db.PaymentSession.update({ status: 'REVIEW_REQUIRED', reviewReason: 'PayPal thông báo đảo giao dịch. Cửa hàng cần đối soát khoản tiền đã thu.' }, { where: { provider: 'paypal', gatewaySaleId: capture.id, status: { [Op.ne]: 'REFUNDED' } } });
        }
        return { errCode: 0, ignored: true };
    }

    const reconcileSession = (sessionId, actor) => resultOf(async () => {
        if (!admin(actor)) fail('Bạn không có quyền đối soát thanh toán.', 403);
        if (!uuid(sessionId)) fail('Mã phiên thanh toán không hợp lệ.');
        return reconcileOne(sessionId);
    });
    async function reconcileOne(sessionId) {
        const session = await db.PaymentSession.findOne({ where: { id: sessionId }, raw: false });
        if (!session) fail('Không tìm thấy phiên thanh toán.', 2);
        if (isDemoSession(session)) fail('Giao dịch dữ liệu mẫu không thể đối soát với cổng thanh toán.', 2);
        if (['COMPLETED', 'REFUNDED'].includes(session.status)) return { errCode: 0, status: session.status, orderId: session.orderId, errMessage: 'Thanh toán đã được đối soát.' };
        await commerce.transaction(async tx => {
            const current = await db.PaymentSession.findOne({ where: { id: sessionId }, ...lock(tx), raw: false });
            current.reconcileAttempts = Number(current.reconcileAttempts || 0) + 1;
            current.lastCheckedAt = now();
            if (current.status === 'PENDING' && new Date(current.expiresAt).getTime() <= now().getTime()) current.status = 'EXPIRED';
            await current.save(options(tx));
        });
        try {
            if (session.provider === 'vnpay') {
                const response = await vnpRequest(queryData(session), 'querydr');
                if (response.vnp_ResponseCode !== '00') return { errCode: 2, status: session.status, errMessage: `VNPay chưa có kết quả giao dịch (${response.vnp_ResponseCode}).` };
                if (response.vnp_TransactionType !== '01') fail('VNPay trả giao dịch hoàn tiền, cần đối soát thủ công.', 3);
                return finalizeVerified(session.id, 'vnpay', vnpEvidence(response, 'querydr'));
            }
            if (session.provider === 'paypal' && session.providerPaymentId) {
                const payment = await paypalRequest(session.gatewayApiVersion === 'v2' ? `/v2/checkout/orders/${encodeURIComponent(session.providerPaymentId)}` : `/v1/payments/payment/${encodeURIComponent(session.providerPaymentId)}`);
                return finalizeVerified(session.id, 'paypal', paypalEvidence(payment, session, 'reconciliation'));
            }
            fail('Chưa có mã giao dịch để đối soát với cổng thanh toán.', 3);
        } catch (error) {
            await db.PaymentSession.update({ lastError: error instanceof CommerceError ? error.message.slice(0, 1000) : 'Không thể kết nối cổng thanh toán. Vui lòng thử đối soát lại.' }, { where: { id: session.id } });
            if (error instanceof CommerceError) return { errCode: error.errCode, status: session.status, errMessage: error.message };
            return { errCode: 3, status: session.status, errMessage: 'Không thể kết nối cổng thanh toán. Vui lòng thử đối soát lại.' };
        }
    }
    const getReconciliation = (query = {}, actor) => resultOf(async () => {
        if (!admin(actor)) fail('Bạn không có quyền xem đối soát.', 403);
        const where = {};
        if (query.status && query.status !== 'ALL') where.status = query.status;
        if (query.provider && ['paypal', 'vnpay'].includes(query.provider)) where.provider = query.provider;
        const result = await db.PaymentSession.findAndCountAll({ where, attributes: { exclude: ['checkoutData'] }, order: [['createdAt', 'DESC']], limit: Math.min(100, Math.max(1, Number(query.limit) || 25)), offset: Math.max(0, Number(query.offset) || 0), raw: true });
        return { errCode: 0, data: result.rows.map(row => ({ ...row, isDemo: isDemoSession(row), gatewayOutcome: parse(row.gatewayOutcome) })), count: result.count,
            readiness: { paypal: { configured: paypalConfigured(), webhookConfigured: !!env.PAYPAL_WEBHOOK_ID, mode: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox' }, vnpay: { configured: vnpConfigured(), mode: env.VNP_URL && !env.VNP_URL.includes('sandbox') ? 'live' : 'sandbox', ipnUrlConfigured: !!env.VNP_IPN_URL } } };
    });

    function refundResult(refund) {
        return { errCode: 0, refundId: refund.id, status: refund.status, provider: refund.provider, providerRefundId: refund.providerRefundId,
            errMessage: refund.status === 'COMPLETED' ? 'Cổng thanh toán đã xác nhận hoàn tiền.' : (refund.lastError || 'Đã ghi nhận yêu cầu. Tiền chỉ được xác nhận hoàn khi cổng thanh toán báo hoàn tất.') };
    }
    const requestRefund = data => resultOf(async () => {
        if ((!positiveInteger(data.orderId) && !uuid(data.sessionId)) || typeof data.refundKey !== 'string' || !data.refundKey || data.refundKey.length > 100) fail('Yêu cầu hoàn tiền không hợp lệ.');
        let refund = await commerce.transaction(async tx => {
            const session = await db.PaymentSession.findOne({ where: { ...(data.sessionId ? { id: data.sessionId } : { orderId: data.orderId }), provider: { [Op.in]: ['paypal', 'vnpay'] } }, ...lock(tx), raw: false });
            if (isDemoSession(session)) fail('Giao dịch dữ liệu mẫu không thể hoàn tiền qua cổng thanh toán.', 2);
            if (!session || (!session.paidAt && session.status !== 'COMPLETED')) fail('Không có giao dịch đã thanh toán để hoàn tiền. Vui lòng đối soát trước.', 2);
            const amountVnd = data.amountVnd == null ? Number(session.totalPrice) : Number(data.amountVnd);
            if (!positiveInteger(amountVnd) || amountVnd > Number(session.totalPrice)) fail('Số tiền hoàn không hợp lệ.');
            const existing = await db.PaymentRefund.findOne({ where: { refundKey: data.refundKey }, ...lock(tx), raw: false });
            if (existing) {
                if (existing.sessionId !== session.id || Number(existing.amountVnd) !== amountVnd) fail('Mã hoàn tiền đã được sử dụng cho yêu cầu khác.', 3);
                return existing;
            }
            const previous = await db.PaymentRefund.findAll({ where: { sessionId: session.id, status: { [Op.ne]: 'FAILED' } }, ...options(tx), raw: true });
            const previousVnd = previous.reduce((sum, row) => sum + BigInt(row.amountVnd), 0n);
            if (previousVnd + BigInt(amountVnd) > BigInt(session.totalPrice)) fail('Số tiền đã hoàn hoặc đang xử lý vượt giá trị thanh toán.', 2);
            if (!sameAmount(session.providerAmount, session.providerAmount, session.currency)) fail('Giá trị tiền của giao dịch gốc không hợp lệ.', 3);
            const captured = minorUnits(session.providerAmount, session.currency);
            const previousUnits = previous.reduce((sum, row) => sum + minorUnits(row.providerAmount, session.currency), 0n);
            // Allocate cumulative cents; the last partial refund returns the exact remaining cent.
            const refundUnits = captured * (previousVnd + BigInt(amountVnd)) / BigInt(session.totalPrice) - previousUnits;
            const providerAmount = session.provider === 'vnpay' ? refundUnits.toString() : `${refundUnits / 100n}.${String(refundUnits % 100n).padStart(2, '0')}`;
            if (Number(providerAmount) <= 0) fail('Số tiền hoàn sau quy đổi không hợp lệ.');
            return db.PaymentRefund.create({ id: crypto.randomUUID(), sessionId: session.id, orderId: session.orderId || null, refundKey: data.refundKey,
                provider: session.provider, status: 'PENDING', amountVnd, providerAmount, currency: session.currency,
                requestId: crypto.randomUUID(), actorId: data.actorId, reason: String(data.reason || 'Hoan tien don hang').slice(0, 1000), attempts: 0 }, options(tx));
        });
        if (refund.status === 'COMPLETED') return updateRefund(refund.id, {});
        return processRefund(refund.id);
    });
    const refundSession = (data, actor) => resultOf(async () => {
        if (!admin(actor)) fail('Bạn không có quyền hoàn tiền phiên thanh toán.', 403);
        if (!uuid(data.sessionId) || typeof data.reason !== 'string' || data.reason.trim().length < 3 || data.reason.length > 1000) fail('Vui lòng nhập phiên thanh toán và lý do hoàn tiền hợp lệ.');
        const session = await db.PaymentSession.findOne({ where: { id: data.sessionId }, raw: true });
        if (!session || session.orderId || !['REVIEW_REQUIRED', 'REFUNDED'].includes(session.status) || !session.paidAt) fail('Chỉ hoàn trực tiếp phiên đã nhận tiền cần đối soát và chưa tạo đơn hàng.', 2);
        return requestRefund({ sessionId: session.id, refundKey: `session-refund:${session.id}`, actorId: actor.id, reason: data.reason });
    });
    async function claimRefund(refundId) {
        return commerce.transaction(async tx => {
            const refund = await db.PaymentRefund.findOne({ where: { id: refundId }, ...lock(tx), raw: false });
            if (!refund) fail('Không tìm thấy yêu cầu hoàn tiền.', 2);
            if (['COMPLETED', 'FAILED'].includes(refund.status)) return { refund, claimed: false };
            if (refund.status === 'PROCESSING' && refund.lastCheckedAt && now().getTime() - new Date(refund.lastCheckedAt).getTime() < 2 * 60 * 1000) return { refund, claimed: false };
            refund.status = 'PROCESSING';
            refund.lastCheckedAt = now();
            await refund.save(options(tx));
            return { refund, claimed: true };
        });
    }
    async function updateRefund(refundId, changes) {
        await commerce.transaction(async tx => {
            const current = await db.PaymentRefund.findOne({ where: { id: refundId }, ...lock(tx), raw: false });
            if (current.status === 'COMPLETED') return;
            Object.assign(current, changes, { lastCheckedAt: now() });
            await current.save(options(tx));
        });
        const refund = await db.PaymentRefund.findOne({ where: { id: refundId }, raw: true });
        if (refund.status === 'COMPLETED' && !refund.orderId) {
            await commerce.transaction(async tx => {
                await db.PaymentSession.update({ status: 'REFUNDED', reviewReason: 'Cổng thanh toán đã xác nhận hoàn tiền phiên chưa tạo đơn.' }, { where: { id: refund.sessionId, orderId: null }, ...options(tx) });
                await db.PaymentRefund.update({ fulfillmentSyncedAt: now() }, { where: { id: refund.id }, ...options(tx) });
            });
        }
        // Keep the after-sales request in sync when the asynchronous retry settles.
        if (refund.status === 'COMPLETED' && refund.orderId && db.ReturnRequest) {
            await commerce.transaction(async tx => {
                const order = await db.OrderProduct.findOne({ where: { id: refund.orderId }, ...lock(tx), raw: false });
                const requestId = /^return-request:(\d+)$/.exec(refund.refundKey || '');
                const request = requestId ? await db.ReturnRequest.findOne({ where: { id: Number(requestId[1]), orderId: refund.orderId }, ...lock(tx), raw: false }) : null;
                if (request && request.status === 'REFUND_PENDING' && request.receivedAt && refund.refundKey === `return-request:${request.id}` && Number(request.amount) === Number(refund.amountVnd)) {
                    request.status = 'REFUNDED'; request.refundMethod = refund.provider; request.refundProviderStatus = 'COMPLETED';
                    request.refundReference = refund.providerRefundId; request.refundedAt = refund.completedAt; request.refundedById = refund.actorId;
                    await request.save(options(tx));
                    if (order) await require('./orderEventService').recordOrderEvent(db, { order, actorId: refund.actorId, type: 'RETURN_REFUNDED', title: 'Đã hoàn tiền', message: 'Cổng thanh toán xác nhận hoàn tiền.', metadata: { refundId: refund.id, provider: refund.provider, providerRefundId: refund.providerRefundId } }, tx);
                }
                if (request && request.status === 'REFUNDED' && Number(request.amount) === Number(refund.amountVnd)) await db.PaymentRefund.update({ fulfillmentSyncedAt: now() }, { where: { id: refund.id }, ...options(tx) });
            });
        }
        return refundResult(refund);
    }
    function refundCaptureId(result) {
        const link = Array.isArray(result.links) && result.links.find(row => row.rel === 'up');
        if (!link || typeof link.href !== 'string') return null;
        try {
            const url = new URL(link.href);
            if (url.protocol !== 'https:' || !['api.paypal.com', 'api-m.paypal.com', 'api.sandbox.paypal.com', 'api-m.sandbox.paypal.com'].includes(url.hostname)) return null;
            const match = /^\/v2\/payments\/captures\/([a-z\d-]+)$/i.exec(url.pathname);
            return match && match[1];
        } catch (_) { return null; }
    }
    async function settlePaypalRefund(refund, saleId, result, version) {
        const v2 = version === 'v2';
        const relatedId = v2 ? refundCaptureId(result) : result.sale_id;
        const amount = result.amount && (v2 ? result.amount.value : result.amount.total);
        const currency = result.amount && (v2 ? result.amount.currency_code : result.amount.currency);
        if (!providerId(result.id) || (refund.providerRefundId && result.id !== refund.providerRefundId) || (v2 ? relatedId !== saleId && result.custom_id !== refund.id : relatedId !== saleId) ||
            (relatedId && relatedId !== saleId) || currency !== refund.currency || !sameAmount(amount, refund.providerAmount, refund.currency)) fail('PayPal trả kết quả hoàn tiền không khớp giao dịch.', 3);
        const state = v2 ? result.status : String(result.state || '').toUpperCase();
        if (!['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED'].includes(state)) fail('PayPal chưa trả trạng thái hoàn tiền hợp lệ.', 3);
        return updateRefund(refund.id, { status: state === 'COMPLETED' ? 'COMPLETED' : (['FAILED', 'CANCELLED'].includes(state) ? 'FAILED' : 'PENDING'), providerRefundId: result.id,
            gatewayOutcome: JSON.stringify({ state, saleId, amount: result.amount, verifiedAt: now().toISOString() }), lastError: null, ...(state === 'COMPLETED' ? { completedAt: now() } : {}) });
    }
    async function processRefund(refundId) {
        // A seeded demo must remain inert even if its status was changed or it
        // has a historical refund ledger. Check before claiming any work lease.
        const candidate = await db.PaymentRefund.findOne({ where: { id: refundId }, raw: true });
        if (!candidate) fail('Không tìm thấy yêu cầu hoàn tiền.', 2);
        const candidateSession = await db.PaymentSession.findOne({ where: { id: candidate.sessionId }, attributes: ['id', 'providerPaymentId'], raw: true });
        if (isDemoSession(candidateSession)) return { errCode: 2, refundId: candidate.id, status: candidate.status, isDemo: true,
            errMessage: 'Giao dịch dữ liệu mẫu không thể đối soát hoặc hoàn tiền qua cổng thanh toán.' };
        const { refund, claimed } = await claimRefund(refundId);
        if (!claimed) return refund.status === 'COMPLETED' ? updateRefund(refund.id, {}) : refundResult(refund);
        const session = await db.PaymentSession.findOne({ where: { id: refund.sessionId }, raw: true });
        try {
            if (refund.provider === 'paypal') {
                if (!paypalConfigured()) return updateRefund(refund.id, { status: 'NOT_CONFIGURED', lastError: 'PayPal chưa có thông tin tài khoản sandbox.' });
                let saleId = session.gatewaySaleId;
                if (!saleId) {
                    const payment = await paypalRequest(session.gatewayApiVersion === 'v2' ? `/v2/checkout/orders/${encodeURIComponent(session.providerPaymentId)}` : `/v1/payments/payment/${encodeURIComponent(session.providerPaymentId)}`);
                    saleId = paypalEvidence(payment, session, 'refund-lookup').saleId;
                    await db.PaymentSession.update({ gatewaySaleId: saleId }, { where: { id: session.id } });
                }
                const v2 = session.gatewayApiVersion === 'v2';
                let result;
                if (refund.providerRefundId) result = await paypalRequest(v2 ? `/v2/payments/refunds/${encodeURIComponent(refund.providerRefundId)}` : `/v1/payments/refund/${encodeURIComponent(refund.providerRefundId)}`);
                else {
                    // Default PayPal idempotency retention can be only six hours. A shorter
                    // window avoids submitting an unknown refund as a new transaction later.
                    if (Number(refund.attempts || 0) > 0 && now().getTime() - new Date(refund.createdAt).getTime() > 5 * 60 * 60 * 1000) return updateRefund(refund.id, { status: 'REVIEW_REQUIRED', lastError: 'Đã hết khoảng thời gian thử lại an toàn. Cần đối soát PayPal trước khi gửi thêm yêu cầu.' });
                    await db.PaymentRefund.update({ attempts: Number(refund.attempts || 0) + 1 }, { where: { id: refund.id } });
                    result = await paypalRequest(v2 ? `/v2/payments/captures/${encodeURIComponent(saleId)}/refund` : `/v1/payments/sale/${encodeURIComponent(saleId)}/refund`, { method: 'POST', requestId: refund.requestId,
                        body: v2 ? { custom_id: refund.id, amount: { value: refund.providerAmount, currency_code: refund.currency } } : { amount: { total: refund.providerAmount, currency: refund.currency } } });
                }
                return await settlePaypalRefund(refund, saleId, result, v2 ? 'v2' : 'v1');
            }
            if (!vnpConfigured()) return updateRefund(refund.id, { status: 'NOT_CONFIGURED', lastError: 'VNPay chưa có thông tin tài khoản sandbox.' });
            let response;
            if (Number(refund.attempts || 0) > 0) {
                // VNPay duplicate request IDs are not a durable idempotency guarantee.
                // An unknown HTTP result is queried, never blindly submitted again.
                response = await vnpRequest(queryData(session), 'querydr');
                if (response.vnp_TransactionType !== (Number(refund.amountVnd) === Number(session.totalPrice) ? '02' : '03')) return updateRefund(refund.id, { status: 'REVIEW_REQUIRED', lastError: 'Chưa tìm thấy kết quả hoàn tiền VNPay. Cần đối soát tại tài khoản merchant.' });
                const otherRefunds = await db.PaymentRefund.findAll({ where: { sessionId: session.id, id: { [Op.ne]: refund.id }, status: { [Op.ne]: 'FAILED' } }, raw: true });
                const request = parse(refund.requestData);
                if (otherRefunds.length && response.vnp_OrderInfo !== request.vnp_OrderInfo && refund.providerRefundId !== `vnpay-refund:${response.vnp_TransactionNo}`) return updateRefund(refund.id, { status: 'REVIEW_REQUIRED', lastError: 'Có nhiều lần hoàn VNPay; kết quả truy vấn chưa xác định được đúng yêu cầu hoàn. Cần đối soát merchant.' });
            } else {
                const request = { vnp_RequestId: refund.requestId.replace(/-/g, ''), vnp_Version: '2.1.0', vnp_Command: 'refund', vnp_TmnCode: env.VNP_TMNCODE,
                    vnp_TransactionType: Number(refund.amountVnd) === Number(session.totalPrice) ? '02' : '03', vnp_TxnRef: session.id, vnp_Amount: refund.providerAmount,
                    vnp_TransactionNo: (session.providerPaymentId || '').replace(/^vnpay:/, ''), vnp_TransactionDate: session.gatewayTransactionDate || dateFormat(session.createdAt),
                    vnp_CreateBy: `staff-${refund.actorId || 'system'}`, vnp_CreateDate: dateFormat(now()), vnp_IpAddr: env.PAYMENT_SERVER_IP || '127.0.0.1', vnp_OrderInfo: `Hoan tien ${refund.id}` };
                await db.PaymentRefund.update({ attempts: 1, requestData: JSON.stringify(request) }, { where: { id: refund.id } });
                response = await vnpRequest(request, 'refund');
            }
            if (!sameAmount(response.vnp_Amount, refund.providerAmount, 'VND') || response.vnp_TransactionType !== (Number(refund.amountVnd) === Number(session.totalPrice) ? '02' : '03')) fail('VNPay trả kết quả hoàn tiền không khớp số tiền hoặc loại hoàn.', 3);
            const completed = response.vnp_ResponseCode === '00' && response.vnp_TransactionStatus === '00';
            if (completed && (!/^\d{1,15}$/.test(response.vnp_TransactionNo || '') || /^0+$/.test(response.vnp_TransactionNo))) fail('VNPay thiếu mã giao dịch hoàn tiền.', 3);
            return updateRefund(refund.id, { status: completed ? 'COMPLETED' : (['05', '06'].includes(response.vnp_TransactionStatus) || response.vnp_ResponseCode === '94' ? 'PENDING' : 'REVIEW_REQUIRED'),
                ...(completed ? { providerRefundId: `vnpay-refund:${response.vnp_TransactionNo}`, completedAt: now() } : {}), gatewayOutcome: JSON.stringify(response), lastError: completed ? null : `VNPay: ${response.vnp_ResponseCode}/${response.vnp_TransactionStatus}. Đang chờ đối soát.` });
        } catch (error) {
            return updateRefund(refund.id, { status: 'REVIEW_REQUIRED', lastError: error instanceof CommerceError ? error.message : 'Kết quả hoàn tiền chưa xác định. Hệ thống giữ yêu cầu để đối soát và tránh hoàn hai lần.' });
        }
    }
    const retryRefund = (refundId, actor) => resultOf(async () => {
        if (actor !== undefined && !admin(actor)) fail('Bạn không có quyền đối soát hoàn tiền.', 403);
        if (!uuid(refundId)) fail('Mã hoàn tiền không hợp lệ.');
        return processRefund(refundId);
    });
    const getRefunds = (query = {}, actor) => resultOf(async () => {
        if (!admin(actor)) fail('Bạn không có quyền xem hoàn tiền.', 403);
        const where = {};
        if (query.status && query.status !== 'ALL') where.status = query.status;
        if (positiveInteger(query.orderId)) where.orderId = query.orderId;
        const result = await db.PaymentRefund.findAndCountAll({ where, attributes: { exclude: ['requestData', 'gatewayOutcome', 'requestId'] }, raw: true, order: [['createdAt', 'DESC']], limit: Math.min(100, Math.max(1, Number(query.limit) || 25)), offset: Math.max(0, Number(query.offset) || 0) });
        const sessionIds = [...new Set(result.rows.map(row => row.sessionId))];
        const sessions = sessionIds.length ? await db.PaymentSession.findAll({ where: { id: { [Op.in]: sessionIds } }, attributes: ['id', 'providerPaymentId'], raw: true }) : [];
        const demos = new Set(sessions.filter(isDemoSession).map(row => row.id));
        return { errCode: 0, data: result.rows.map(row => ({ ...row, isDemo: demos.has(row.sessionId) })), count: result.count };
    });
    let batchRunning = false;
    async function runReconciliationBatch() {
        if (batchRunning) return { skipped: true };
        batchRunning = true;
        try {
            const sessions = await db.PaymentSession.findAll({ where: { status: { [Op.in]: ['PENDING', 'EXPIRED', 'REVIEW_REQUIRED'] }, [Op.or]: [{ lastCheckedAt: null }, { lastCheckedAt: { [Op.lt]: new Date(now().getTime() - 5 * 60 * 1000) } }] }, limit: 10, order: [['updatedAt', 'ASC']], raw: true });
            for (const session of sessions) if (!isDemoSession(session)) await reconcileOne(session.id);
            const refunds = await db.PaymentRefund.findAll({ where: { status: { [Op.in]: ['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'NOT_CONFIGURED'] }, [Op.or]: [{ lastCheckedAt: null }, { lastCheckedAt: { [Op.lt]: new Date(now().getTime() - 5 * 60 * 1000) } }] }, limit: 10, raw: true });
            for (const refund of refunds) await processRefund(refund.id);
            const unsynced = await db.PaymentRefund.findAll({ where: { status: 'COMPLETED', fulfillmentSyncedAt: null }, limit: 10, raw: true });
            for (const refund of unsynced) await processRefund(refund.id);
            return { sessions: sessions.length, refunds: refunds.length };
        } finally { batchRunning = false; }
    }
    return { createPaypalPayment, completeVnpay, completePaypal, vnpayIpn, paypalWebhook, validateVnpayNotice, finalizeVerified, reconcileSession, getReconciliation, requestRefund, refundSession, retryRefund, getRefunds, runReconciliationBatch, paypalRequest };
}
let defaultService;
function gateway() { return defaultService || (defaultService = createPaymentGatewayService(require('../models'))); }
module.exports = { createPaymentGatewayService, gateway, signVnpayApi, verifyVnpayApi, VNP_QUERY_REQUEST, VNP_REFUND_REQUEST, VNP_RESPONSE, sameAmount };
