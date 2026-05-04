const express = require('express')
const router = express.Router();

const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const commonRoutes = require("./commonRoutes");
const managerRoutes = require("./managerRoutes");
const agencyRoutes = require("./agencyRoutes");

router.use('/user', userRoutes);
router.use('/agency', agencyRoutes);
router.use('/admin', adminRoutes);
router.use('/manager', managerRoutes);
router.use('/common', commonRoutes);

module.exports = router;