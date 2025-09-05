const express = require("express");
require("./connectdb");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { PORT } = require("./config");
const { oauth2Client } = require("./config");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

app.use("/shorten", require("./routes/shorten"));
app.use("/upload", require("./routes/upload"));
app.use("/", require("./routes/redirect"));

app.get("/", (_, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
