const mongoose = require("mongoose");

const VerificationOtpSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      enum: ["signup_email", "signup_mobile"],
      required: true,
      index: true,
    },
    email: { type: String, index: true },
    countryCode: { type: String, index: true },
    mobileNumber: { type: String, index: true },
    otp: { type: String, required: true },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index (auto delete)
    },
  },
  { timestamps: true }
);

VerificationOtpSchema.index(
  { purpose: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
VerificationOtpSchema.index(
  { purpose: 1, countryCode: 1, mobileNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      countryCode: { $type: "string" },
      mobileNumber: { $type: "string" },
    },
  }
);

module.exports = mongoose.model("verificationOtp", VerificationOtpSchema);

