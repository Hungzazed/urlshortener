const mongoose = require("mongoose");

// 🔹 Schema link
const shortLinkSchema = new mongoose.Schema({
  originalUrl: { type: String, required: true },
  shortCode: { type: String, unique: true, required: true },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const ShortLink = mongoose.model("ShortLink", shortLinkSchema);


module.exports = {ShortLink};