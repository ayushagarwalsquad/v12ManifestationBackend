const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const InfluencerDetailsSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "user",
        required: true,
        index: true
    },

    // UNIQUE INFLUENCER CODE
    influencerCode: {
        type: String,
        unique: true,
        sparse: true
    },

    //social media links
    instaId: String,
    facebookId: String,

    //location
    state: String,
    district: String,
    capital: String,

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

module.exports = mongoose.model("influencerDetails", InfluencerDetailsSchema);
