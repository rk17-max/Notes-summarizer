require("dotenv").config();
const mongoose = require("mongoose");

const databaseconnect = async () => {
    try {
        // 👇 This safely pulls the URL from your .env file locally, or from Render in production
        await mongoose.connect(process.env.MONGO_URI);
        console.log("database connected");
    } catch (err) {
        console.log("Database connection error:", err);
    }
}

module.exports = databaseconnect;