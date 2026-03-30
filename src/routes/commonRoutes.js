const express = require('express');
const imageController = require('../controllers/common/imageController');
const { uploadSingle, uploadMultiple } = require("../middleware/upload");
const router = express.Router();

// Image Upload/Delete Routes
router.post('/upload/image', uploadSingle, imageController.uploadImage);
router.post('/upload/images', uploadMultiple, imageController.uploadMultipleImages);
router.delete('/delete/image', imageController.deleteImage);
router.post('/delete/images', imageController.deleteMultipleImages);
router.get('/image/info', imageController.getImageInfo);

module.exports = router;