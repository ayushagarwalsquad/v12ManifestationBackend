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
    email: String,
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
    roles: {
        type: [String],
        enum: ["user", "partner", "influencer"],
        default: ["user"],
        index: true
    },

    generalCode: { type: String },
    activeCode: { type: String },
    activeCodeType: {
        type: String,
        enum: ["general", "partner", "influencer"],
        default: "general",
        index: true
    },

    walletBalance: { type: Number, default: 0 },
    isWelcomeBonusGiven: { type: Boolean, default: false },
    resetPasswordOTP: String,
    resetPasswordExpires: Date,
    addresses: [AddressSchema],
    devices: [DeviceSchema],
    status: {
        type: String,
        enum: ["active", "blocked", "deleted"],
        default: "active",
        index: true
    },
    accountPrivacy: {
        type: String,
        enum: ["public", "private"],
        default: "public"
    },
}, { timestamps: true });

// Unique email (only for non-deleted users)
UserSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } }
);

// Unique mobile (only for non-deleted users)
UserSchema.index(
    { countryCode: 1, mobileNumber: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: "deleted" } } }
);

// Unique codes (sparse so existing docs with missing values don't conflict)
UserSchema.index({ generalCode: 1 }, { unique: true, sparse: true });
UserSchema.index({ activeCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("user", UserSchema);