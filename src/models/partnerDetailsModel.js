const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const PartnerDetailsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },

    // UNIQUE PARTNER CODE
    partnerCode: {
        type: String,
        unique: true,
        sparse: true
    },

    //category
    partnerCategory: {
        type: String,
        enum: ["partner"],
        required: true
    },

    //type
    partnerType: {
        type: String,
        enum: [
            "manager_associate",// manager ke niche
            "agency_associate"// agency ke niche
        ],
        required: true
    },

    managerCode: {
        type: String, // only for manager_associate
        default: null
    },
    agencyCode: {
        type: String, // only for agency_associate
        default: null
    },

    //location
    state: String,
    district: String,
    capital: String,

    //documents
    //store the response from aadhar verification service
    aadharResponse: {
        type: String,
    },
    panNo: String,
    panCardName: String,

    //verification
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: function () {
            return this.isVerified ? "approved" : "pending";
        },
        index: true
    },
    reviewedBy: {
        type: Schema.Types.ObjectId,
        ref: "admin",
        default: null
    },
    reviewedAt: Date,
    rejectionReason: String,
}, { timestamps: true });

module.exports = mongoose.model("partnerDetails", PartnerDetailsSchema);
