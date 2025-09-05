const express = require("express");
const Link = require("../models/Link");

const router = express.Router();

router.get("/:code", async (req, res) => {
  const link = await Link.findOne({ shortCode: req.params.code });
  if (!link) return res.status(404).send("Link không tồn tại");

  if (link.type === "file") {
    if (new Date() > link.expirationDate) {
      await Link.deleteOne({ _id: link._id });
      return res.status(410).send("File đã hết hạn");
    }
    res.redirect(`https://drive.google.com/uc?export=download&id=${link.filePath}`);
  } else {
    res.redirect(link.originalUrl);
  }
  link.clicks++;
  await link.save();
});

module.exports = router;
