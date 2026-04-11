"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";

interface SubmissionDetail {
  id: string;
  course_id: string;
  assignment_id: string;
  overall_score: number;
  grade: string;
  submitted_at: string;
}

interface LeaderboardEntry {
  name: string;
  score: number;
  rank: number;
}

interface Progress {
  courses_enrolled: number;
  completed: number;
  avg_score: number;
  rank: number;
  total: number;
  submissions: SubmissionDetail[];
  leaderboard: LeaderboardEntry[];
}

export default function ProgressPage() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/trainee/progress")
      .then(setProgress)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "80px 48px", textAlign: "center" }}>
        <span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>
          Loading progress...
        </span>
      </div>
    );
  }

  if (!progress) return null;

  const metrics = [
    { label: "COURSES", value: progress.courses_enrolled },
    { label: "COMPLETED", value: progress.completed },
    { label: "AVG SCORE", value: progress.avg_score ? `${progress.avg_score}%` : "--" },
    { label: "RANK", value: `#${progress.rank} of ${progress.total}` },
  ];

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1">
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>
          DASHBOARD
        </span>
        <h1 className="display-heading" style={{ fontSize: 36, marginBottom: 40 }}>
          Your Progress
        </h1>
      </div>

      <div className="animate-in animate-in-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 }}>
        {metrics.map((m) => (
          <div key={m.label} className="card" style={{ padding: "24px 20px" }}>
            <span style={{ display: "block", marginBottom: 10, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
              {m.label}
            </span>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--text-heading)", lineHeight: 1 }}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {progress.submissions.length > 0 && (
        <div className="animate-in animate-in-3" style={{ marginBottom: 40 }}>
          <span className="overline" style={{ display: "block", marginBottom: 16 }}>
            YOUR SUBMISSIONS
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {progress.submissions.map((sub) => (
              <div key={sub.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px" }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                    {sub.assignment_id}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", marginLeft: 12 }}>
                    {new Date(sub.submitted_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 120, height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${sub.overall_score}%`, background: sub.overall_score >= 80 ? "var(--success)" : sub.overall_score >= 60 ? "var(--warning)" : "var(--danger)", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-heading)" }}>
                    {sub.overall_score}%
                  </span>
                  <span className={`badge ${sub.overall_score >= 80 ? "badge-success" : sub.overall_score >= 60 ? "badge-warning" : "badge-danger"}`}>
                    {sub.grade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="animate-in animate-in-4">
        <span className="overline" style={{ display: "block", marginBottom: 16 }}>
          LEADERBOARD
        </span>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Name", "Score"].map((h) => (
                  <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {progress.leaderboard.map((entry) => {
                const isMe = entry.name === "Demo Trainee";
                return (
                  <tr key={entry.rank} style={{ background: isMe ? "var(--accent-subtle)" : entry.rank % 2 === 0 ? "var(--bg-tertiary)" : "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 20px", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: entry.rank <= 3 ? "var(--accent)" : "var(--text-tertiary)" }}>
                      {entry.rank}
                    </td>
                    <td style={{ padding: "10px 20px", fontSize: 14, color: isMe ? "var(--accent)" : "var(--text-primary)", fontWeight: isMe ? 600 : 400 }}>
                      {entry.name}
                      {isMe && <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>YOU</span>}
                    </td>
                    <td style={{ padding: "10px 20px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>
                      {entry.score}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
