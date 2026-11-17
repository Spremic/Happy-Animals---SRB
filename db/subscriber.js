const mongoose = require("mongoose");

const SubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "unsubscribed"],
      default: "active",
    },
    source: {
      type: String,
      default: "popup_modal",
    },
  },
  {
    timestamps: true,
    collection: "Newsletter",
  }
);

const Subscriber = mongoose.model("Subscriber", SubscriberSchema);

module.exports = Subscriber;

