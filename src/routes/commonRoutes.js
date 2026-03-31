const express = require('express');
const imageController = require('../controllers/common/imageController');
const { userAuth } = require('../middleware/userAuth');
const router = express.Router();

router.post('/upload/url', userAuth, imageController.getUploadUrl);

module.exports = router;