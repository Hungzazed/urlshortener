const express = require("express");
require("./connectdb");
const { Link } = require("./schema");
const { isValidUrl } = require("./utils/checkValidUrl");
const { encodeBase62 } = require("./utils/base62");
const { google } = require("googleapis");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

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

async function uploadChunk(location, chunk, start, fileSize, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const end = start + chunk.length - 1;
      const res = await axios({
        method: "PUT",
        url: location,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        },
        data: chunk,
        validateStatus: status => (status >= 200 && status < 300) || status === 308,
      });
      if (res.status === 200 || res.status === 201) {
        return { status: res.status, data: res.data }; // Upload hoàn tất
      } else if (res.status === 308) {
        const range = res.headers.range; // Ví dụ: "bytes=0-524287"
        if (range) {
          const receivedEnd = parseInt(range.split("-")[1]);
          if (receivedEnd >= end) {
            console.log(`Chunk ${start}-${end} uploaded successfully`);
            return { status: 308 }; // Chunk được nhận, tiếp tục
          } else {
            throw new Error(`Incomplete upload for chunk ${start}-${end}, received ${range}`);
          }
        }
        return { status: 308 }; // Không có Range header, giả sử chunk được nhận
      }
    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.warn(`Rate limit hit, retrying (${attempt}/${retries}) after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else if (attempt === retries) {
        throw err; // Ném lỗi nếu hết số lần thử
      }
    }
  }
}

// API upload file
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

    let filePath;
    try {
      // 1. Lấy resumable session URI từ Google Drive
      const accessToken = oauth2Client.credentials.access_token;
      const fileName = `${Date.now()}-${file.originalname}`;
      const mimeType = file.mimetype;

      const res1 = await axios({
        method: "POST",
        url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          name: fileName,
          mimeType: mimeType,
        }),
      });
      const location = res1.headers.location;

      // 2. Đọc file và chia thành chunks
      const data = await fs.promises.readFile(file.path);
      const totalFileSize = data.length;
      const chunkSize = 2 * 256 * 1024; // 512KB per chunk
      const chunks = [];
      for (let i = 0; i < totalFileSize; i += chunkSize) {
        chunks.push(data.subarray(i, i + chunkSize));
      }

      // 3. Upload từng chunk
      let start = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const res2 = await uploadChunk(location, chunk, start, totalFileSize);
        if (res2.status === 200 || res2.status === 201) {
          filePath = res2.data.id; // Lấy ID file khi hoàn tất
          break; // Thoát vòng lặp khi upload xong
        }
        start += chunk.length;
      }

      if (!filePath) {
        throw new Error("Upload incomplete: No file ID received");
      }

      // Thiết lập quyền truy cập công khai
      await drive.permissions.create({
        fileId: filePath,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      await fs.promises.unlink(file.path);
    } catch (err) {
      console.error("Upload error:", err);
      await fs.promises.unlink(file.path).catch(console.error);
      return res.status(500).json({ error: "Lỗi upload file lên Google Drive: " + err.message });
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

app.get("/", async (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
})

// 🔹 Chạy server
app.listen(PORT, () => {
  console.log(`🚀 Server running at ${BASE_URL}`);
});