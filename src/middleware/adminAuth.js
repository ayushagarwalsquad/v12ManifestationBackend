const jwt = require("jsonwebtoken");
const Admin = require("../models/adminModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");

exports.adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");
        if (!authHeader) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Authorization header missing"
            });
        }

        const token = authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : authHeader;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded || !decoded.adminId) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token payload"
            });
        }

        const admin = await Admin.findById(decoded.adminId);
        if (!admin) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Access denied. Admin not found."
            });
        }

        if (admin.status !== "active") {
            return responseHandler({
                res,
                code: statusCode.FORBIDDEN,
                message: "Admin account is not active"
            });
        }

        const deviceWithToken = admin.devices.find(
            (device) => device.accessToken === token
        );
        if (!deviceWithToken) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token. Please log in again."
            });
        }

        req.admin = admin;
        req.adminId = admin._id;
        req.accessToken = token;
        next();
    } catch (err) {
        if (err.name === "JsonWebTokenError") {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token. Please log in again.",
                error: err.message
            });
        }

        if (err.name === "TokenExpiredError") {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Session expired. Please log in again."
            });
        }

        return responseHandler({
            res,
            code: statusCode.ERROR,
            message: "Authentication failed",
            error: err.message
        });
    }
};

exports.requireSuperAdmin = (req, res, next) => {
    if (!req.admin || req.admin.role !== "super_admin") {
        return responseHandler({
            res,
            code: statusCode.FORBIDDEN,
            message: "Only super admin can perform this action"
        });
    }

    next();
};
