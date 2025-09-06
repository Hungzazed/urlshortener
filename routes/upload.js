const express = require("express");
const multer = require("multer");
const fs = require("fs");
const Link = require("../models/Link");
const { encodeBase62 } = require("../utils/base62");
const { BASE_URL } = require("../config");
const { uploadToGoogleDrive } = require("../utils/uploadToGGDrive");

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 20 * 1024 * 1024 } }).single("file");

// ✅ Tối ưu route với random shortCode
router.post("/", (req, res) => {
  upload(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });

    const { alias } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Chưa chọn file" });

    try {
      // ✅ Sử dụng random shortCode thay vì count
      let shortCode = alias;
      if (!shortCode) {
        do {
          shortCode = encodeBase62(Math.floor(Math.random() * 1000000) + Date.now());
        } while (await Link.exists({ shortCode }));
      } else {
        if (await Link.exists({ shortCode })) {
          return res.status(400).json({ error: "Alias đã tồn tại" });
        }
      }

      // ✅ Upload với token management
      const fileId = await uploadToGoogleDrive(file);
      
      // Clean up temp file
      await fs.promises.unlink(file.path);

      const expirationDate = file.size < 10 * 1024 * 1024
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const link = await Link.create({
        shortCode,
        type: "file",
        filePath: fileId,
        fileSize: file.size,
        expirationDate,
      });

      res.json({ 
        shortUrl: `${BASE_URL}/${link.shortCode}`, 
        expirationDate 
      });
      
    } catch (error) {
      console.error('Upload error:', error);
      
      // Clean up temp file on error
      if (file && file.path) {
        try {
          await fs.promises.unlink(file.path);
        } catch (unlinkError) {
          console.error('Error cleaning up temp file:', unlinkError);
        }
      }
      
      if (error.message.includes('access token')) {
        res.status(401).json({ error: "Token hết hạn, vui lòng thử lại" });
      } else {
        res.status(500).json({ error: "Lỗi upload file" });
      }
    }
  });
});


module.exports = router;
