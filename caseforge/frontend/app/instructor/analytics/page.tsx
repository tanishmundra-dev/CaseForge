"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

interface Summary { total_trainees: number; total_submissions: number; avg_score: number; completion_rate: number; courses_published: number; }

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [scoreDist, setScoreDist] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAPI("/instructor/analytics/summary"),
      fetchAPI("/instructor/analytics/submissions"),
      fetchAPI("/instructor/analytics/score-distribution"),
      fetchAPI("/instructor/analytics/attendance"),
    ]).then(([s, sub, sd, att]) => {
      setSummary(s); setSubmissions(sub); setScoreDist(sd); setAttendance(att);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 60 }}><p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading analytics...</p></div>;
  if (!summary) return null;

  const gradeColors: Record<string, string> = { "81-100": "#16A34A", "61-80": "#D97706", "41-60": "#F59E0B", "21-40": "#DC2626", "0-20": "#991B1B" };
  const PIE_COLORS = ["#16A34A", "#D97706", "#F59E0B", "#DC2626", "#991B1B"];

  return (
    <div style={{ padding: "48px 48px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ marginBottom: 40 }}>
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>ANALYTICS</span>
        <h1 className="display-heading" style={{ fontSize: 36 }}>Platform Overview</h1>
      </div>

      {/* Summary cards */}
      <div className="animate-in animate-in-2" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 32 }}>
        {[
          { label: "Students", value: summary.total_trainees, color: "var(--accent)" },
          { label: "Submissions", value: summary.total_submissions, color: "var(--text-heading)" },
          { label: "Avg Score", value: `${summary.avg_score}%`, color: summary.avg_score >= 70 ? "var(--success)" : "var(--warning)" },
          { label: "Completion", value: `${summary.completion_rate}%`, color: "var(--success)" },
          { label: "Courses", value: summary.courses_published, color: "var(--accent)" },
        ].map((m) => (
          <div key={m.label} className="card" style={{ padding: "20px 20px", textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: m.color }}>{m.value}</p>
            <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="animate-in animate-in-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
        {/* Score distribution */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Score Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {scoreDist.map((entry, i) => <Cell key={i} fill={gradeColors[entry.range] || "#D97706"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Activity / Attendance */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Daily Activity (Last 7 Days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={attendance}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="submissions" stroke="#D97706" strokeWidth={2} dot={{ r: 4, fill: "#D97706" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="animate-in animate-in-4">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Leaderboard</h3>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Rank</th>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Student</th>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Assignment</th>
                <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Score</th>
                <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {submissions.slice(0, 15).map((s: any, i: number) => (
                <tr key={s.id || i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 20px", fontFamily: "var(--font-mono)", color: i < 3 ? "var(--accent)" : "var(--text-secondary)", fontWeight: i < 3 ? 700 : 400 }}>#{i + 1}</td>
                  <td style={{ padding: "10px 20px", fontWeight: 500 }}>{s.trainee_name}</td>
                  <td style={{ padding: "10px 20px", color: "var(--text-secondary)", fontSize: 13 }}>{s.assignment_id}</td>
                  <td style={{ padding: "10px 20px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: s.overall_score >= 80 ? "var(--success)" : s.overall_score >= 60 ? "var(--warning)" : "var(--danger)" }}>{s.overall_score}</span>
                  </td>
                  <td style={{ padding: "10px 20px", textAlign: "right" }}>
                    <span className={`badge ${s.overall_score >= 80 ? "badge-success" : s.overall_score >= 60 ? "badge-warning" : "badge-danger"}`} style={{ fontSize: 10 }}>{s.grade}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
