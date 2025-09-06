const { oauth2Client } = require("../config");
const { loadOrSetCredentials } = require("../utils/loadToken");

async function ensureValidToken() {
  try {
    // Check if token exists and is valid
    if (!oauth2Client.credentials.access_token) {
      await loadOrSetCredentials();
    }
    
    // Check if token is expired
    const now = new Date().getTime();
    const expiry = oauth2Client.credentials.expiry_date;
    
    if (expiry && now >= expiry - 60000) { // Refresh 1 minute before expiry
      console.log('Token expiring soon, refreshing...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    }
  } catch (error) {
    console.error('Error ensuring valid token:', error);
    throw new Error('Failed to get valid access token');
  }
}

module.exports = { ensureValidToken };