const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      trim: true,
      lowercase: true,
      default: "aktivan", // "aktivan", "neaktivan", "rasprodato"
      index: true,
    },
    price: {
      type: Number,
      required: true,
    },
    oldPrice: {
      type: Number,
    },
    stock: {
      type: Number,
      default: 10,
      min: 0,
    },
    category: [
      {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
        index: true,
      },
    ],
    subcategory: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    subcategory2: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    sizes: [
      {
        type: String,
        trim: true,
      },
    ],
    variantType: {
      type: String,
      enum: ["kg", "size", "volume", "pieces", "custom"],
      default: "kg",
    },
    variants: [
      {
        label: { type: String, trim: true, required: true },
        price: { type: Number, required: true, min: 0 },
        oldPrice: { type: Number, default: null },
        stock: { type: Number, default: 10, min: 0 },
      },
    ],
    petType: [
      {
        type: String,
        trim: true,
      },
    ],
    lifeStage: {
      type: String,
      trim: true,
      default: "",
    },
    flavor: {
      type: String,
      trim: true,
      default: "",
    },
    specialDiet: [
      {
        type: String,
        trim: true,
      },
    ],
    colors: [
      {
        name: { type: String, trim: true },
        hex: { type: String, trim: true },
        code: { type: String, trim: true },
        stock: { type: Number, default: 10, min: 0 },
      },
    ],
    material: {
      type: String,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    technicalData: {
      labels: [{ type: String, trim: true }],
      features: [{ type: String, trim: true }],
    },
    description: {
      type: String,
      trim: true,
    },
    mainImages: {
      type: String,
      trim: true,
      lowercase: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isBestseller: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "Products",
  }
);

ProductSchema.index({ title: "text", description: "text" });
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, stock: 1 });
ProductSchema.index({ stock: 1 });
ProductSchema.index({ "variants.stock": 1 });
ProductSchema.index({ "colors.stock": 1 });
ProductSchema.index({ status: 1, price: 1 });
ProductSchema.index({ status: 1, isBestseller: 1 });
ProductSchema.index({ status: 1, isFeatured: 1 });
ProductSchema.index({ subcategory: 1 });
ProductSchema.index({ subcategory2: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ createdAt: -1 });

const Product = mongoose.model("Product", ProductSchema);

module.exports = Product;

