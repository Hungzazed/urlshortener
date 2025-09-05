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




module.exports = { loadOrSetCredentials, getNewToken, drive };