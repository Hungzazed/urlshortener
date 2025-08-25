const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json());

mongoose.connect(process.env.DB_URL);

// 🔹 Schema link
const shortLinkSchema = new mongoose.Schema({
  originalUrl: { type: String, required: true },
  shortCode: { type: String, unique: true, required: true },
  clicks: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const ShortLink = mongoose.model("ShortLink", shortLinkSchema);

// 🔹 API tạo link ngắn với custom alias
app.post("/shorten", async (req, res) => {
  const { url, alias } = req.body;

  if (!url || !alias) {
    return res.status(400).json({ error: "Cần truyền cả url và alias" });
  }

  // Kiểm tra alias đã tồn tại chưa
  const exists = await ShortLink.findOne({ shortCode: alias });
  if (exists) {
    return res.status(400).json({ error: "Alias đã tồn tại, hãy chọn tên khác" });
  }

  // Lưu vào DB
  const newLink = new ShortLink({
    originalUrl: url,
    shortCode: alias
  });

  await newLink.save();

  res.json({ shortUrl: `http://localhost:3000/${alias}` });
});

// 🔹 API redirect
app.get("/:code", async (req, res) => {
  const { code } = req.params;
  const link = await ShortLink.findOne({ shortCode: code });

  if (!link) return res.status(404).send("Alias không tồn tại");

  link.clicks++;
  await link.save();

  res.redirect(link.originalUrl);
});

app.get("/", async (req, res) =>{
  res.send("Welcome to URL Shortener Service");
})

// 🔹 Chạy server
app.listen(3000, () => console.log("🚀 Server running at http://localhost:3000"));