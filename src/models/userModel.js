const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const AddressSchema = new Schema({
    addressTag: String,
    isDefault: { type: Boolean, default: false },
    countryCode: String,
    mobileNumber: String,
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: false,
            default: undefined,
            validate: {
                validator: function (coords) {
                    return coords === undefined || (Array.isArray(coords) && coords.length === 2);
                },
                message: "Coordinates must be empty or contain exactly two values: [longitude, latitude]",
            },
        },
        address: String,
        pincode: String,
        landmark: String,
    }
});
const DeviceSchema = new Schema({
    deviceType: {
        type: String,
        enum: ["android", "ios", "web"],
        // required: true
    },
    deviceToken: {
        type: String,
        // required: true
    },
    accessToken: {
        type: String,   // JWT per device
        required: true
    }
});
const UserSchema = new Schema({
    shortId: String,
    fullname: String,
    username: { type: String, unique: true },
    email: { type: String, unique: true },
    countryCode: String,
    mobileNumber: String,
    password: String,
    agreeToTerms: Boolean,
    profileImage: String,
    bio: String,
    dob: Date,
    gender: {
        type: String,
        enum: ["male", "female", "other"],
    },
    resetPasswordOTP: String,
    resetPasswordExpires: Date,
    addresses: [AddressSchema],
    status: {
        type: String,
        enum: ["active", "blocked", "deleted"],
        default: "active"
    },
    accountPrivacy: {
        type: String,
        enum: ["public", "private"],
        default: "public"
    },
    devices: [DeviceSchema]
}, { timestamps: true });

module.exports = mongoose.model("user", UserSchema);