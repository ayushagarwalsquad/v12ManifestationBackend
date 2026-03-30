const statusCode = require("../utils/httpResponseCode");

const invalidRouteHandler = (req, res, next) => {
    const err = new Error(`Can't find ${req.originalUrl} on the server!`);
    err.statusCode = statusCode.RESULTNOTFOUND;
    err.message = `The requested URL ${req.originalUrl} was not found on this server.`;
    next(err);
};

module.exports = invalidRouteHandler;