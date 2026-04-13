"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    if (result.error) setError(result.error);
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800 }}>
            <span style={{ color: "var(--text-heading)" }}>case</span>
            <span style={{ color: "var(--accent)" }}>-forge</span>
          </h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 14, marginTop: 8 }}>
            AI-Powered Learning Platform
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
            Sign In
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <p style={{ color: "var(--danger)", fontSize: 13, textAlign: "center" }}>{error}</p>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: "100%", padding: "12px 0", marginTop: 4 }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p style={{ fontSize: 13, color: "var(--text-tertiary)", textAlign: "center", marginTop: 20 }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "var(--accent)", fontWeight: 500 }}>Sign up</Link>
          </p>
        </div>

      </div>
    </div>
  );
}
