const jwt = require("jsonwebtoken");

//models
const Manager = require("../models/managerModel");

//utils
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");


exports.managerAuth = async (req, res, next) => {
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
        console.log("Decoded Manager Token:", decoded);

        if (!decoded || !decoded.managerId) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token payload"
            });
        }

        const manager = await Manager.findById(decoded.managerId);
        console.log("Authenticated Manager:", manager?._id);

        if (!manager) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Access denied. Manager not found.",
            });
        }

        if (manager.status === "suspended" || manager.status === "deleted") {
            return responseHandler({
                res,
                code: statusCode.FORBIDDEN,
                message: "Your account is suspended/deleted. Please contact support."
            });
        }

        // Attach manager info to request
        req.managerId = manager._id;
        req.manager = manager;
        req.accessToken = token;

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Token expired"
            });
        }
        if (error.name === "JsonWebTokenError") {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token"
            });
        }
        return responseHandler({
            res,
            code: statusCode.SERVERERROR,
            message: "Authentication error"
        });
    }
};
