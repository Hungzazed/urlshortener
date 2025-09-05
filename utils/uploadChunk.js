const axios = require("axios");

async function uploadChunk(location, chunk, start, fileSize, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const end = start + chunk.length - 1;
      const res = await axios({
        method: "PUT",
        url: location,
        headers: { "Content-Range": `bytes ${start}-${end}/${fileSize}` },
        data: chunk,
        validateStatus: s => (s >= 200 && s < 300) || s === 308,
      });
      if ([200, 201].includes(res.status)) return { status: res.status, data: res.data };
      return { status: 308 };
    } catch (err) {
      if (err.response?.status === 429 && attempt < retries) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      } else throw err;
    }
  }
}
module.exports = { uploadChunk };
