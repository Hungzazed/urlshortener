const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.DB_URL)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));
