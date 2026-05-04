const jwt = require("jsonwebtoken");
const Agency = require("../models/agencyModel");
const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");

exports.agencyAuth = async (req, res, next) => {
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
        if (!decoded || !decoded.agencyId) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Invalid token payload"
            });
        }

        const agency = await Agency.findById(decoded.agencyId);
        if (!agency) {
            return responseHandler({
                res,
                code: statusCode.UNAUTHORIZED,
                message: "Access denied. Agency not found."
            });
        }

        if (["blocked", "deleted"].includes(agency.status)) {
            return responseHandler({
                res,
                code: statusCode.FORBIDDEN,
                message: "Your account is blocked/deleted. Please contact support."
            });
        }

        req.agencyId = agency._id;
        req.agency = agency;
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
            code: statusCode.ERROR,
            message: "Authentication failed"
        });
    }
};
