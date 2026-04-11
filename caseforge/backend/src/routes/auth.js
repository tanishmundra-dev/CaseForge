const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../supabase");
const { generateToken, authMiddleware } = require("../middleware/auth");

const router = express.Router();

// ── Login ──
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ── Signup (creates student account) ──
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  // Check if email exists
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (existing) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from("users")
    .insert({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password_hash,
      role: "student",
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ── Get current user (validate token) ──
router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
