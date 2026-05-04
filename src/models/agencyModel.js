const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const DeviceSchema = new Schema({
    deviceType: {
        type: String,
        enum: ["android", "ios", "web"]
    },
    deviceToken: String,
    accessToken: {
        type: String,
        required: true
    }
});

const AgencySchema = new Schema(
    {
        agencyId: {
            type: String,
            unique: true,
            required: true
        },
        agencyCode: {
            type: String,
            unique: true,
            sparse: true
        },
        fullname: String,
        username: {
            type: String,
            unique: true,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        countryCode: String,
        mobileNumber: String,
        password: {
            type: String,
            required: true
        },
        profileImage: String,
        dob: Date,
        gender: {
            type: String,
            enum: ["male", "female", "other"]
        },
        status: {
            type: String,
            enum: ["active", "blocked", "deleted"],
            default: "active"
        },
        agreeToTerms: {
            type: Boolean,
            default: false
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        devices: [DeviceSchema]
    },
    { timestamps: true }
);

AgencySchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } }
);
AgencySchema.index(
    { countryCode: 1, mobileNumber: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } }
);

module.exports = mongoose.model("Agency", AgencySchema);
