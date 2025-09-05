const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;

function encodeBase62(num) {
  if (num === 0) return "0";
  let s = "";
  while (num > 0) {
    s = ALPHABET[num % BASE] + s;
    num = Math.floor(num / BASE);
  }
  return s.padStart(7, "0");
}

module.exports = { encodeBase62 };
