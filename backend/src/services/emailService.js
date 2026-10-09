require('dotenv').config();
const nodemailer = require('nodemailer');

const configurationError = () => {
    const error = new Error('Dịch vụ email chưa được cấu hình. Vui lòng liên hệ quản trị viên');
    error.statusCode = 503;
    error.code = 'EMAIL_NOT_CONFIGURED';
    return error;
};

const ensureConfigured = () => {
    const username = process.env.SMTP_USER || process.env.EMAIL_APP;
    const password = process.env.SMTP_PASSWORD || process.env.EMAIL_APP_PASSWORD;
    if (!username || !password) throw configurationError();
    return { username, password };
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const sendSimpleEmail = async (data) => {
    const { username, password } = ensureConfigured();
    if (!['verifyEmail', 'forgotpassword'].includes(data.type)) throw new Error('Unsupported email type');
    const reset = data.type === 'forgotpassword';
    const title = reset ? 'Đặt lại mật khẩu' : 'Xác thực email';
    const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
    const link = new URL(data.redirectLink);
    if (!['http:', 'https:'].includes(link.protocol)) throw new Error('Invalid email redirect URL');
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: { user: username, pass: password },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    try {
        return await transporter.sendMail({
            from: process.env.EMAIL_FROM || `"DACS Shop" <${username}>`,
            to: data.email, subject: `${title} | DACS Shop`,
            text: `Xin chào ${fullName}!\n${title} tại: ${link.href}\nLiên kết hết hạn sau ${reset ? '1 giờ' : '24 giờ'}. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
            html: `<h3>Xin chào ${escapeHtml(fullName)}!</h3><p>Vui lòng mở liên kết bên dưới để ${reset ? 'đặt lại mật khẩu' : 'xác thực email'}.</p><p><a href="${escapeHtml(link.href)}">${title}</a></p><p>Liên kết hết hạn sau ${reset ? '1 giờ' : '24 giờ'}. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
        });
    } catch (cause) {
        const error = new Error('Chưa gửi được email. Vui lòng thử lại sau hoặc liên hệ quản trị viên');
        error.statusCode = 503;
        error.code = 'EMAIL_DELIVERY_FAILED';
        throw error;
    } finally {
        transporter.close();
    }
};

module.exports = { sendSimpleEmail, ensureConfigured };
