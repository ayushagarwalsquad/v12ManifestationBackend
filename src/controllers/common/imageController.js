const { S3Client, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { responseHandler } = require("../../utils/responseHandler");
const statusCode = require("../../utils/httpResponseCode");
const { catchAsyncError } = require("../../utils/generateError");

const s3 = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    region: process.env.AWS_REGION,
});

// Upload single image
exports.uploadImage = catchAsyncError(async (req, res) => {
    if (!req.file) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "No image file provided"
        });
    }

    const imageUrl = req.file.location;
    const imageKey = req.file.key;

    return responseHandler({
        res,
        code: statusCode.CREATED,
        message: "Image uploaded successfully",
        data: {
            imageUrl: imageUrl,
            imageKey: imageKey,
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        }
    });
});
// Upload multiple images
exports.uploadMultipleImages = catchAsyncError(async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "No image files provided"
        });
    }

    const uploadedImages = req.files.map(file => ({
        imageUrl: file.location,
        imageKey: file.key,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
    }));

    return responseHandler({
        res,
        code: statusCode.CREATED,
        message: "Images uploaded successfully",
        data: {
            images: uploadedImages,
            count: uploadedImages.length
        }
    });
});
// Delete image from S3
exports.deleteImage = catchAsyncError(async (req, res) => {
    const { imageKey } = req.query;

    if (!imageKey) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "Image key is required"
        });
    }

    try {
        // Check if the object exists before deleting
        const headParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: imageKey
        };

        await s3.send(new HeadObjectCommand(headParams));

        // Delete the object
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: imageKey
        };

        await s3.send(new DeleteObjectCommand(deleteParams));

        return responseHandler({
            res,
            code: statusCode.SUCCESS,
            message: "Image deleted successfully"
        });

    } catch (error) {
        if (error.name === 'NotFound') {
            return responseHandler({
                res,
                code: statusCode.RESULTNOTFOUND,
                message: "Image not found"
            });
        }

        throw error;
    }
});
// Delete multiple images from S3
exports.deleteMultipleImages = catchAsyncError(async (req, res) => {
    const { imageKeys } = req.body;

    if (!imageKeys || !Array.isArray(imageKeys) || imageKeys.length === 0) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "Image keys array is required"
        });
    }

    const results = [];
    const errors = [];

    for (const imageKey of imageKeys) {
        try {
            // Check if the object exists before deleting
            const headParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: imageKey
            };

            await s3.send(new HeadObjectCommand(headParams));

            // Delete the object
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: imageKey
            };

            await s3.send(new DeleteObjectCommand(deleteParams));
            results.push({ imageKey, status: 'deleted' });

        } catch (error) {
            if (error.name === 'NotFound') {
                errors.push({ imageKey, error: 'Image not found' });
            } else {
                errors.push({ imageKey, error: error.message });
            }
        }
    }

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: `Deletion completed. ${results.length} deleted, ${errors.length} failed`,
        data: {
            deleted: results,
            errors: errors,
            summary: {
                total: imageKeys.length,
                deleted: results.length,
                failed: errors.length
            }
        }
    });
});
// Get image info (without downloading)
exports.getImageInfo = catchAsyncError(async (req, res) => {
    const { imageKey } = req.body;

    if (!imageKey) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "Image key is required"
        });
    }

    try {
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: imageKey
        };

        const response = await s3.send(new HeadObjectCommand(params));

        const imageInfo = {
            key: imageKey,
            url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`,
            size: response.ContentLength,
            lastModified: response.LastModified,
            contentType: response.ContentType,
            etag: response.ETag
        };

        return responseHandler({
            res,
            code: statusCode.SUCCESS,
            message: "Image info retrieved successfully",
            data: imageInfo
        });

    } catch (error) {
        if (error.name === 'NotFound') {
            return responseHandler({
                res,
                code: statusCode.RESULTNOTFOUND,
                message: "Image not found"
            });
        }

        throw error;
    }
});
