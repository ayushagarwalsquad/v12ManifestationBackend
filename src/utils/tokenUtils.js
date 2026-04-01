const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY;
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not set in environment (secretOrPrivateKey must have a value)');
}

exports.generateAdminToken = (admin) => {
    const payload = {
        adminId: admin._id,
        role: admin.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

exports.generateUserToken = (user) => {
    const payload = {
        userId: user._id,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};