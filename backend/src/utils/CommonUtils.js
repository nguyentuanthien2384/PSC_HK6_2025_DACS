import JWT from 'jsonwebtoken';
import { createHash } from 'crypto';
require('dotenv').config();

const TOKEN_ISSUER = 'dacs-ecommerce';

const passwordVersion = (passwordHash) => createHash('sha256')
    .update(String(passwordHash)).digest('hex').slice(0, 24);

const encodeToken = (userId, passwordHash) => {
    if (!process.env.JWT_SECRET) {
        const error = new Error('JWT_SECRET is not configured');
        error.statusCode = 503;
        throw error;
    }
    return JWT.sign({ ver: passwordVersion(passwordHash) }, process.env.JWT_SECRET, {
        algorithm: 'HS256',
        issuer: TOKEN_ISSUER,
        subject: String(userId),
        expiresIn: '3d',
    });
};

module.exports = { encodeToken, passwordVersion, TOKEN_ISSUER };
