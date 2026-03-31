const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
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

exports.getUploadUrl = catchAsyncError(async (req, res) => {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
        return responseHandler({
            res,
            code: statusCode.DATAMISSING,
            message: "fileName and fileType are required"
        });
    }

    const key = `v12manifestation/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        ContentType: fileType
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 });

    const fileUrl = `${process.env.CLOUDFRONT_URL}/${key}`;

    return responseHandler({
        res,
        code: statusCode.SUCCESS,
        message: "Upload URL generated successfully",
        data: {
            uploadUrl,
            fileUrl,
            key
        }
    });
});