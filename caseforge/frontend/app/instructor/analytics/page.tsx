"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface Summary {
  total_trainees: number;
  total_submissions: number;
  avg_score: number;
  completion_rate: number;
  courses_published: number;
}

interface Submission {
  id: string;
  trainee_name: string;
  overall_score: number;
  grade: string;
  submitted_at: string;
}

interface ScoreBucket {
  range: string;
  count: number;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [distribution, setDistribution] = useState<ScoreBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchAPI("/instructor/analytics/summary"),
      fetchAPI("/instructor/analytics/submissions"),
      fetchAPI("/instructor/analytics/score-distribution"),
    ])
      .then(([s, subs, dist]) => {
        setSummary(s);
        setSubmissions(subs);
        setDistribution(dist);
      })
      .finally(() => setLoading(false));
  }, []);

  const timelineData = submissions.map((s, i) => ({
    name: `Sub ${i + 1}`,
    score: s.overall_score,
  }));

  if (loading) {
    return (
      <div style={{ padding: "80px 48px", textAlign: "center" }}>
        <span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>
          Loading analytics...
        </span>
      </div>
    );
  }

  const metrics = [
    { label: "TRAINEES", value: summary?.total_trainees ?? 0 },
    { label: "SUBMISSIONS", value: summary?.total_submissions ?? 0 },
    { label: "AVG SCORE", value: `${summary?.avg_score ?? 0}%` },
    { label: "COURSES", value: summary?.courses_published ?? 0 },
  ];

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1">
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>
          TRAINING PERFORMANCE
        </span>
        <h1 className="display-heading" style={{ fontSize: 36, marginBottom: 40 }}>
          Analytics
        </h1>
      </div>

      <div
        className="animate-in animate-in-2"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 36 }}
      >
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

      <div className="animate-in animate-in-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 36 }}>
        <div className="card">
          <span style={{ display: "block", marginBottom: 20, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
            SCORE DISTRIBUTION
          </span>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distribution}>
              <CartesianGrid stroke="#E5E1D8" strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fill: "#A8A29E", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }} axisLine={{ stroke: "#E5E1D8" }} tickLine={{ stroke: "#E5E1D8" }} />
              <YAxis tick={{ fill: "#A8A29E", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }} axisLine={{ stroke: "#E5E1D8" }} tickLine={{ stroke: "#E5E1D8" }} />
              <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#0F0F0F" }} />
              <Bar dataKey="count" fill="#D97706" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <span style={{ display: "block", padding: "20px 20px 14px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
            LEADERBOARD
          </span>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Name", "Score", "Grade"].map((h) => (
                  <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => (
                <tr key={s.id} style={{ background: i % 2 === 0 ? "var(--bg-secondary)" : "var(--bg-tertiary)", borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: i < 3 ? "var(--accent)" : "var(--text-tertiary)" }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14, color: "var(--text-primary)" }}>{s.trainee_name}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>{s.overall_score}%</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span className={`badge ${s.overall_score >= 80 ? "badge-success" : s.overall_score >= 60 ? "badge-warning" : "badge-danger"}`}>
                      {s.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card animate-in animate-in-4">
        <span style={{ display: "block", marginBottom: 20, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)" }}>
          SUBMISSIONS OVER TIME
        </span>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={timelineData}>
            <CartesianGrid stroke="#E5E1D8" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fill: "#A8A29E", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }} axisLine={{ stroke: "#E5E1D8" }} tickLine={{ stroke: "#E5E1D8" }} />
            <YAxis tick={{ fill: "#A8A29E", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }} axisLine={{ stroke: "#E5E1D8" }} tickLine={{ stroke: "#E5E1D8" }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#0F0F0F" }} />
            <Line type="monotone" dataKey="score" stroke="#D97706" strokeWidth={2} dot={{ fill: "#D97706", r: 4 }} activeDot={{ fill: "#B45309", r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
