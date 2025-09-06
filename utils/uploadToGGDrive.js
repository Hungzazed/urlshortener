const fs = require("fs");
const { google } = require("googleapis");
const { oauth2Client } = require("../config");
const { ensureValidToken } = require("./ensureValidToken");


async function uploadToGoogleDrive(file) {
  await ensureValidToken(); // Đảm bảo token valid
  
  const drive = google.drive({ version: "v3", auth: oauth2Client });
  
  const fileMetadata = {
    name: `${Date.now()}-${file.originalname}`,
  };
  
  const media = {
    mimeType: file.mimetype,
    body: fs.createReadStream(file.path),
  };
  
  const driveFile = await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
  });
  
  // Set permission
  await drive.permissions.create({
    fileId: driveFile.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });
  
  return driveFile.data.id;
}

module.exports = { uploadToGoogleDrive };