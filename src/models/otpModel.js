const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const OtpSchema = new Schema({
  countryCode: String,
  mobileNumber: String,
  otp: String,
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // ⏳ TTL index (auto delete)
  }
}, { timestamps: true });

module.exports = mongoose.model("otp", OtpSchema);