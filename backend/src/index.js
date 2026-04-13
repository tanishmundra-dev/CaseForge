require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const instructorRoutes = require("./routes/instructor");
const traineeRoutes = require("./routes/trainee");

const app = express();
const PORT = process.env.PORT || 8000;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "CaseForge API is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/trainee", traineeRoutes);

app.listen(PORT, () => {
  console.log(`CaseForge backend running on http://localhost:${PORT}`);
});
