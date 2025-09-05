const express = require("express");
const Link = require("../models/Link");
const { isValidUrl } = require("../utils/checkValidUrl");
const { encodeBase62 } = require("../utils/base62");
const { BASE_URL } = require("../config");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { url, alias } = req.body;
    if (!url || !isValidUrl(url)) return res.status(400).json({ error: "URL không hợp lệ" });

    const shortCode = alias || encodeBase62(await Link.countDocuments() + 1);
    if (await Link.exists({ shortCode })) return res.status(400).json({ error: "Alias đã tồn tại" });

    const link = await Link.create({ shortCode, type: "url", originalUrl: url });
    res.json({ shortUrl: `${BASE_URL}/${link.shortCode}` });
  } catch (err) {
    res.status(500).json({ error: "Lỗi tạo short URL" });
  }
});

module.exports = router;
