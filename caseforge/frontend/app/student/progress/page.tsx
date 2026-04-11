"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";

export default function StudentProgressPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/trainee/progress")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60 }}><p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading...</p></div>;
  if (!data) return <div style={{ padding: 60 }}><p style={{ color: "var(--text-secondary)" }}>No progress data.</p></div>;

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ marginBottom: 40 }}>
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>MY PROGRESS</span>
        <h1 className="display-heading" style={{ fontSize: 36 }}>Track your journey</h1>
      </div>

      {/* Metrics */}
      <div className="animate-in animate-in-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 }}>
        {[
          { label: "Courses", value: data.courses_enrolled },
          { label: "Completed", value: data.completed },
          { label: "Avg Score", value: data.avg_score },
          { label: "Rank", value: `#${data.rank} of ${data.total}` },
        ].map((m) => (
          <div key={m.label} className="card" style={{ padding: "20px 24px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: "var(--text-heading)" }}>{m.value}</p>
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      {data.leaderboard?.length > 0 && (
        <div className="animate-in animate-in-3">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Leaderboard</h2>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 12, textTransform: "uppercase" }}>Rank</th>
                  <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 12, textTransform: "uppercase" }}>Name</th>
                  <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 12, textTransform: "uppercase" }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((entry: any) => (
                  <tr key={entry.rank} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 20px", fontFamily: "var(--font-mono)", color: entry.rank <= 3 ? "var(--accent)" : "var(--text-secondary)" }}>#{entry.rank}</td>
                    <td style={{ padding: "12px 20px", fontWeight: 500 }}>{entry.name}</td>
                    <td style={{ padding: "12px 20px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{entry.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
