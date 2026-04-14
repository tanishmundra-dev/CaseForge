// routes/code.js
const express = require("express");
const router = express.Router();
const { runCode, runTests, getLanguages, healthCheck } = require("../services/judge0");

// Health check — verify Judge0 is running
router.get("/judge0/health", async (req, res) => {
  const status = await healthCheck();
  res.json(status);
});

// Get available languages
router.get("/languages", async (req, res) => {
  const languages = await getLanguages();
  res.json(languages);
});

// "Run Code" button — execute and return output
router.post("/run-code", async (req, res) => {
  try {
    const { code, language, stdin } = req.body;
    if (!code) return res.status(400).json({ stdout: "", stderr: "No code provided", exit_code: 1 });
    const result = await runCode(code, language || "javascript", stdin || "", 10);
    res.json(result);
  } catch (err) {
    res.status(500).json({ stdout: "", stderr: err.message, exit_code: 1 });
  }
});

// "Submit" button — run against test cases
router.post("/run-tests", async (req, res) => {
  try {
    const { code, language, test_cases, function_name } = req.body;
    if (!code) return res.status(400).json({ error: "No code provided" });
    const result = await runTests(code, language || "javascript", test_cases || [], function_name, 15);
    res.json(result);
  } catch (err) {
    res.status(500).json({ test_results: [], passed: 0, total: 0, all_passed: false, stderr: err.message });
  }
});

module.exports = router;
