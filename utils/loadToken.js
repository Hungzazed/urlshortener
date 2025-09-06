// Load token từ biến môi trường hoặc authorize
const fs = require("fs").promises;
const path = require("path");
const { oauth2Client } = require("../config");

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


module.exports = { loadOrSetCredentials, getNewToken };