const express = require('express')
const router = express.Router();

const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const commonRoutes = require("./commonRoutes");

router.use('/user', userRoutes);
router.use('/admin', adminRoutes);
router.use('/common', commonRoutes);

module.exports = router;