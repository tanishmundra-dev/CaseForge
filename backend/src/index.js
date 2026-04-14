require("dotenv").config();
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const instructorRoutes = require("./routes/instructor");
const traineeRoutes = require("./routes/trainee");
const codeRoutes = require("./routes/code");

const app = express();
const PORT = process.env.PORT || 8000;

// CORS: use CORS_ORIGINS env var for deployment (comma-separated), fallback to localhost for dev
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: corsOrigins,
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
app.use("/api", codeRoutes);

app.listen(PORT, () => {
  console.log(`CaseForge backend running on http://localhost:${PORT}`);
});
