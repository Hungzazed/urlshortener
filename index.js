const express = require("express");
require("./connectdb");
const { ShortLink } = require("./schema");
const { isValidUrl } = require("./utils/checkValidUrl");
const { encodeBase62 } = require("./utils/base62");

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// 🔹 API tạo link ngắn với custom alias
app.post("/shorten", async (req, res) => {
  const { url, alias } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Cần truyền cả url hợp lệ" });
  }

  let shortCode;
  if (alias) {
    if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
      return res.status(400).json({ error: "Alias chỉ được chứa a-z, A-Z, 0-9, _, -" });
    }
    const exists = await ShortLink.findOne({ shortCode: alias });
    if (exists) {
      return res.status(400).json({ error: "Alias đã tồn tại, hãy chọn tên khác" });
    }
    shortCode = alias;
  } else {
    // Tạo alias bằng base62 dựa trên ID tăng dần
    const count = await ShortLink.countDocuments();
    const urlId = count + 1; // ID mới cho URL
    shortCode = encodeBase62(urlId);

    // Kiểm tra xem shortCode có trùng không (hiếm, nhưng để chắc chắn)
    const exists = await ShortLink.findOne({ shortCode });
    if (exists) {
      return res.status(500).json({ error: "Lỗi tạo short code, thử lại" });
    }
  }

  // Lưu vào DB
  const newLink = new ShortLink({
    originalUrl: url,
    shortCode: shortCode
  });

  try {
    await newLink.save();
    res.json({ shortUrl: `${BASE_URL}/${shortCode}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi lưu URL" });
  }
});

// 🔹 API redirect
app.get("/:code", async (req, res) => {
  const { code } = req.params;
  const link = await ShortLink.findOne({ shortCode: code });

  if (!link) return res.status(404).send("link không tồn tại");

  link.clicks++;
  await link.save();

  res.redirect(link.originalUrl);
});

app.get("/", async (req, res) =>{
  res.sendFile(__dirname + '/public/index.html');
})

// 🔹 Chạy server
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
});