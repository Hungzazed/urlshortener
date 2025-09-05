const express = require("express");
require("./connectdb");
const { Link } = require("./schema");
const { isValidUrl } = require("./utils/checkValidUrl");
const { encodeBase62 } = require("./utils/base62");
const { google } = require("googleapis");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Cấu hình multer để xử lý upload file
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB tối đa
}).single("file");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

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

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

// Middleware kiểm tra lỗi upload
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "Kích thước file vượt quá 20MB" });
  } else if (err) {
    return res.status(500).json({ error: "Lỗi upload file" });
  }
  next();
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  const tokenJson = JSON.stringify(tokens);
  process.env.GOOGLE_TOKEN = tokenJson; // Local test
  console.log("Token generated, set GOOGLE_TOKEN in Heroku Config Vars:", tokenJson);

  const tokenPath = path.join(__dirname, "token.json");
  await fs.promises.writeFile(tokenPath, tokenJson);
  console.log("Token stored to", tokenPath);

  res.send("Authentication successful! Set GOOGLE_TOKEN in Heroku and restart.");
});

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
    const exists = await Link.findOne({ shortCode: alias });
    if (exists) {
      return res.status(400).json({ error: "Alias đã tồn tại, hãy chọn tên khác" });
    }
    shortCode = alias;
  } else {
    const count = await Link.countDocuments();
    const urlId = count + 1;
    shortCode = encodeBase62(urlId);
    const exists = await Link.findOne({ shortCode });
    if (exists) {
      return res.status(500).json({ error: "Lỗi tạo short code, thử lại" });
    }
  }

  const newLink = new Link({
    shortCode,
    type: 'url',
    originalUrl: url,
  });

  try {
    await newLink.save();
    res.json({ shortUrl: `${BASE_URL}/${shortCode}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi server khi lưu URL" });
  }
});

// 🔹 API upload file
app.post("/upload", (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { alias } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Cần truyền file" });
    }

    let shortCode;
    if (alias) {
      if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
        return res.status(400).json({ error: "Alias chỉ được chứa a-z, A-Z, 0-9, _, -" });
      }
      const exists = await Link.findOne({ shortCode: alias });
      if (exists) {
        return res.status(400).json({ error: "Alias đã tồn tại, hãy chọn tên khác" });
      }
      shortCode = alias;
    } else {
      const count = await Link.countDocuments();
      const urlId = count + 1;
      shortCode = encodeBase62(urlId);
      const exists = await Link.findOne({ shortCode });
      if (exists) {
        return res.status(500).json({ error: "Lỗi tạo short code, thử lại" });
      }
    }

    const fileSize = file.size;
    const fileSizeMB = fileSize / (1024 * 1024);
    const expirationDate = fileSizeMB < 10
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const fileMetadata = { name: `${Date.now()}-${file.originalname}` };
    const media = { mimeType: file.mimetype, body: fs.createReadStream(file.path) };
    let filePath;
    try {
      const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id",
      });
      filePath = response.data.id;

      await drive.permissions.create({
        fileId: filePath,
        requestBody: {
          role: 'reader',
          type: 'anyone', 
        },
      });

      await fs.promises.unlink(file.path);
    } catch (err) {
      console.error(err);
      await fs.promises.unlink(file.path).catch(console.error);
      return res.status(500).json({ error: "Lỗi upload file lên Google Drive" });
    }

    const newLink = new Link({
      shortCode,
      type: 'file',
      filePath,
      fileSize,
      expirationDate,
    });

    try {
      await newLink.save();
      res.json({ shortUrl: `${BASE_URL}/${shortCode}`, expirationDate });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Lỗi server khi lưu file link" });
    }
  });
});

// 🔹 API redirect hoặc tải file
app.get("/:code", async (req, res) => {
  const { code } = req.params;
  const link = await Link.findOne({ shortCode: code });

  if (!link) return res.status(404).send("Link không tồn tại");

  if (link.type === 'file') {
    if (new Date() > link.expirationDate) {
      await Link.deleteOne({ shortCode: code });
      return res.status(410).send("Link file đã hết hạn và bị xóa");
    }
    link.clicks++;
    await link.save();
    const fileUrl = `https://drive.google.com/uc?export=download&id=${link.filePath}`;
    res.redirect(fileUrl);
  } else {
    link.clicks++;
    await link.save();
    res.redirect(link.originalUrl);
  }
});

app.get("/", async (req, res) =>{
  res.sendFile(__dirname + '/public/index.html');
})

// 🔹 Chạy server
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
});