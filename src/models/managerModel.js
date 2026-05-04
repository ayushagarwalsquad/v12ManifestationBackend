const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Schema = mongoose.Schema;

const MANAGER_TYPES = ["partner_manager", "agency_manager"];
const MANAGER_STATUS = ["active", "inactive", "suspended", "deleted"];

const DeviceSchema = new Schema({
    deviceType: {
        type: String,
        enum: ["android", "ios"],
    },
    deviceToken: {
        type: String,
    },
    accessToken: {
        type: String,
        required: true
    }
});

const ManagerSchema = new Schema(
    {
        managerId: {
            type: String,
            unique: true,
            required: true
        },
        partnerCode: {
            type: String,
            unique: true,
            sparse: true
        },
        managerType: {
            type: String,
            enum: MANAGER_TYPES,
            required: true
        },
        username: {
            type: String,
            unique: true,
            required: true
        },
        fullname: {
            type: String,
            required: true
        },
        email: {
            type: String,
            unique: true,
            lowercase: true,
            required: true
        },
        countryCode: String,
        mobileNumber: String,
        password: {
            type: String,
            required: true,
            select: false
        },
        profileImage: String,
        dob: Date,
        gender: {
            type: String,
            enum: ["male", "female", "other"]
        },

        // Territory/Location Assignment
        state: {
            type: String,
            required: true
        },
        district: {
            type: String,
            required: true
        },
        capital: {
            type: String,
            required: true
        },

        // KYC Documents
        //documents
        //store the response from aadhar verification service
        aadharResponse: {
            type: String,
        },
        panNo: String,
        panCardName: String,

        // Manager Status
        status: {
            type: String,
            enum: MANAGER_STATUS,
            default: "active"
        },

        // Bank Details for Settlement
        bankAccountNumber: String,
        bankIFSC: String,
        bankHolderName: String,
        bankName: String,
        upiId: String,

        // Devices & Sessions
        devices: [DeviceSchema],

        // Authentication
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "Admin"
        },

        // Password Reset
        resetPasswordOTP: String,
        resetPasswordExpires: Date
    },
    { timestamps: true }
);

// Hash password before saving
ManagerSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
ManagerSchema.methods.comparePassword = async function (enteredPassword) {
    try {
        return await bcrypt.compare(enteredPassword, this.password);
    } catch (error) {
        throw new Error("Error comparing passwords");
    }
};

// Indexes for better query performance
ManagerSchema.index({ managerType: 1, status: 1 });
ManagerSchema.index({ state: 1, district: 1, capital: 1 });

module.exports = mongoose.model("Manager", ManagerSchema);
