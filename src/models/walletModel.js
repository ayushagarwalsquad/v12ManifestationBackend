const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const WalletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "user",
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true
  },
  reason: {
    type: String, // welcome_bonus, order_payment, refund
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("wallet", WalletSchema);