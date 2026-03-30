const jwt = require("jsonwebtoken");

//models
const User = require("../models/userModel");

//utils
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");


exports.userAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Authorization header missing",
            });
        }
        // ✅ Support both "Bearer <token>" and "<token>"
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : authHeader;

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("Decoded Token:", decoded);
        if (!decoded || !decoded.userId) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token payload"
            });
        }
        const user = await User.findById(decoded.userId);
        console.log("Authenticated User:", user);//it contains _id
        if (!user) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Access denied. User not found.",
            })
        }
        if (user.status === "Blocked" || user.status === "Deleted") {
            return responseHandler({
                res,
                code: statusCode.FORBIDDEN,
                message: "Your account is blocked/deleted. Please contact support."
            });
        }
        
        // Validate token against devices array (if devices exist)
        if (user.devices && user.devices.length > 0) {
            const deviceWithToken = user.devices.find(
                (device) => device.accessToken === token
            );
            // If devices exist but token doesn't match any device, still allow (for backward compatibility)
            // You can uncomment below to enforce device-specific auth
            // if (!deviceWithToken) {
            //     return responseHandler({
            //         res,
            //         code: statusCode.UNAUTHORIZED,
            //         message: "Invalid token. Please log in again."
            //     });
            // }
        }
        
        req.user = user; // attach user object to request
        req.userId = user._id; // convenience field for legacy code
        req.accessToken = token; // current request token for downstream filtering
        next();
    } catch (err) {
        console.log("Auth Error:", err.name);
        if (err.name === 'JsonWebTokenError') {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token. Please log in again.",
                error: err.message
            });
        }
        if (err.name === 'TokenExpiredError') {
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
        })
    }
};
