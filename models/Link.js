const mongoose = require("mongoose");

const linkSchema = new mongoose.Schema({
  shortCode: { type: String, unique: true, required: true },
  type: { type: String, enum: ["url", "file"], required: true },
  originalUrl: String,
  filePath: String,
  fileSize: Number,
  expirationDate: Date,
  clicks: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Link", linkSchema);
