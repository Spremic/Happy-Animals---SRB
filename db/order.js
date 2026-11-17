const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    streetName: {
      type: String,
      required: true,
      trim: true,
    },
    houseNumber: {
      type: String,
      trim: true,
      default: "",
    },
    apartment: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    paymentMethod: {
      type: String,
      enum: ["pouzecem", "kartica", "cod", "card", "paypal"],
      default: "pouzecem",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    status: {
      type: String,
      enum: ["na_cekanju", "obradjeno", "poslato", "isporuceno", "otkazano"],
      default: "na_cekanju",
      index: true,
    },
    items: [
      {
        productId: { type: String, trim: true },
        code: { type: String, trim: true },
        title: { type: String, required: true },
        variant: { type: String, default: "" },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        price: { type: Number, required: true },
        quantity: { type: Number, default: 1 },
        image: { type: String, default: "" },
        total: { type: Number, required: true },
      },
    ],
    shippingAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: "Orders",
  }
);

const Order = mongoose.model("Order", OrderSchema);

module.exports = Order;

