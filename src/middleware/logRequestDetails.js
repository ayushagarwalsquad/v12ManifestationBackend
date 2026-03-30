const logRequestDetails = (req, res, next) => {
    const logDetails = {
        Timestamp: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }),
        Url: req.originalUrl,
        Method: req.method,
        Query: req.query,
        Body: req.body,
        Params: req.params,
        Cookies: req.cookies,
        // IP: req.ip || req.connection.remoteAddress,
        Headers: {
            Authorization: req.headers['authorization'],
            Host: req.headers['host'],
        },
    };
    // console.log("API Request Details:", JSON.stringify(logDetails, null, 2));
    console.dir(logDetails, { depth: null, colors: true });
    next();
};

module.exports = logRequestDetails;