const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config({quiet: true});
const port = process.env.PORT;

//utils
const { responseHandler } = require("./src/utils/responseHandler.js");
const statusCode = require("./src/utils/httpResponseCode.js");

const rootRoute = require("./src/routes/rootRoute.js");

require("./src/database/db.js");
const app = express();

//importing middlewares
const logRequestDetails = require("./src/middleware/logRequestDetails.js");
const invalidRouteHandler = require("./src/middleware/invalidRouteHandler.js");
const globalErrorHandler = require("./src/middleware/globalErrorHandler.js");

app.use(cors());
// Middleware to parse incoming JSON requests
app.use(express.json());
app.use(logRequestDetails);
app.use(morgan('dev'));

// API routes
app.use('/api/v1', rootRoute);
app.use(invalidRouteHandler);
app.use(globalErrorHandler);
// Root route
app.use('/', (req, res) => {
    console.log("Root route accessed");
    responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Welcome To v12Manifestation rootroute http://localhost:8001/",
    });
});

app.listen(port, () => {
    console.log(`Server Is Running On http://localhost:${port}/`);
});