require("dotenv").config({
    path: require("path").resolve(__dirname, "../.env")
});

const express = require("express");
const pool = require("./db");

const app = express();

app.use(express.json());

app.get("/api/v1/health", (req, res) => {
    res.json({ message: "CodeBridge AI API is running" });
});

app.get("/api/v1/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT current_database()");

        res.json({
            message: "Database connected successfully",
            database: result.rows[0].current_database
        });
    } catch (error) {
        console.error("Database connection error:", error);
        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
