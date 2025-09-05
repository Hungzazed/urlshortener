// Load token từ biến môi trường hoặc authorize
const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const drive = google.drive({
  version: "v3",
  auth: oauth2Client,
});

async function loadOrSetCredentials() {
  const savedToken = process.env.GOOGLE_TOKEN;
  if (savedToken) {
    oauth2Client.setCredentials(JSON.parse(savedToken));
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
  });
  console.log("Authorize this app by visiting this url:", authUrl);
}


module.exports = { loadOrSetCredentials, getNewToken, drive };