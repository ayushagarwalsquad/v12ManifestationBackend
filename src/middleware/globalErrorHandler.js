const { responseHandler } = require("../utils/responseHandler");
const statusCode = require("../utils/httpResponseCode");

const globalErrorHandler = (err, req, res, next) => {
    const code = err.statusCode || statusCode.ERROR;
    const message = err.message || 'Internal Server Error';
    console.error(err);

    return responseHandler({
        res,
        code,
        message,
        success: false,
    });
};

module.exports = globalErrorHandler;