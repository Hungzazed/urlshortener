const express = require("express");
const multer = require("multer");
const fs = require("fs");
const axios = require("axios");
const { google } = require("googleapis");
const Link = require("../models/Link");
const { encodeBase62 } = require("../utils/base62");
const { uploadChunk } = require("../utils/uploadChunk");
const { BASE_URL } = require("../config");
const path = require("path");
const { oauth2Client } = require("../config");

const router = express.Router();
const upload = multer({ dest: "uploads/", limits: { fileSize: 20 * 1024 * 1024 } }).single("file");

async function loadOrSetCredentials() {
  const savedToken = process.env.GOOGLE_TOKEN;
  if (savedToken) {
    const credentials = JSON.parse(savedToken)
    oauth2Client.setCredentials(credentials);
    return;
  }
  const tokenPath = path.join(__dirname, "token.json");
  try {
    const content = await fs.readFile(tokenPath);
    const credentials = JSON.parse(content);
    oauth2Client.setCredentials(credentials);
  } catch (err) {
    return getNewToken(oauth2Client);
  }
}

async function getNewToken(oauth2Client) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    prompt: "consent"
  });
  console.log("Authorize this app by visiting this url:", authUrl);
}

loadOrSetCredentials().catch(console.error);

const drive = google.drive({ version: "v3", auth: oauth2Client });

router.post("/", (req, res) => {
  upload(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });

    const { alias } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Chưa chọn file" });

    try {
      const shortCode = alias || encodeBase62(await Link.countDocuments() + 1);
      if (await Link.exists({ shortCode })) return res.status(400).json({ error: "Alias đã tồn tại" });

      // Upload to Drive
      const accessToken = oauth2Client.credentials.access_token;
      const res1 = await axios.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        { name: `${Date.now()}-${file.originalname}`, mimeType: file.mimetype },
        { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
      );
      const location = res1.headers.location;
      const data = await fs.promises.readFile(file.path);
      let fileId;

      for (let i = 0, start = 0; i < data.length; i += 512 * 1024) {
        const chunk = data.subarray(i, i + 512 * 1024);
        const res2 = await uploadChunk(location, chunk, start, data.length);
        if ([200, 201].includes(res2.status)) { fileId = res2.data.id; break; }
        start += chunk.length;
      }
      await drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" } });
      await fs.promises.unlink(file.path);

      const expirationDate = file.size < 10 * 1024 * 1024
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const link = await Link.create({
        shortCode, type: "file", filePath: fileId, fileSize: file.size, expirationDate,
      });

      res.json({ shortUrl: `${BASE_URL}/${link.shortCode}`, expirationDate });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Lỗi upload file" });
    }
  });
});

module.exports = router;
