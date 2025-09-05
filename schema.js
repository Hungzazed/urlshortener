const mongoose = require('mongoose');
const linkSchema = new mongoose.Schema({
  shortCode: { type: String, required: true, unique: true },
  type: { type: String, enum: ['url', 'file'], required: true },
  originalUrl: { type: String }, // Chỉ dùng cho type: url
  filePath: { type: String }, // Chỉ dùng cho type: file
  fileSize: { type: Number }, // Chỉ dùng cho type: file
  expirationDate: { type: Date }, // Chỉ dùng cho type: file
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});
const Link = mongoose.model('Link', linkSchema);

module.exports = { Link };