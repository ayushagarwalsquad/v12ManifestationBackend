const express = require('express')
const router = express.Router();

const userRoutes = require("./userRoutes");
// const adminRoutes = require("./adminRoutes");
// const driverRoutes = require("./driverRoutes");
// const commonRoutes = require("./commonRoutes");

router.use('/user', userRoutes);
// router.use('/admin', adminRoutes);
// router.use('/driver', driverRoutes);
// router.use('/common', commonRoutes);

module.exports = router;