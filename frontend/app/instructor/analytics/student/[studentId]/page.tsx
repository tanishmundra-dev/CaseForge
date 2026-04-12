"use client";
import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import {
  ArrowLeft, BookOpen, Trophy, BarChart3, Clock,
  ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus,
  Target, Award, Zap, Calendar,
} from "lucide-react";

/* ── Types ── */
interface CourseProgress {
  course_id: string;
  title: string;
  difficulty: string;
  status: string;
  enrolled_at: string | null;
  submissions: number;
  avg_score: number;
  best_score: number;
  latest_submission: string | null;
}

interface Submission {
  id: string;
  course_id: string;
  assignment_id: string;
  class_id?: string;
  overall_score: number;
  grade: string;
  overall_feedback: string;
  strengths?: string[];
  improvements?: string[];
  criterion_scores?: Record<string, number> | null;
  submitted_at: string;
}

interface StudentDetail {
  student: { id: string; name: string; email: string; created_at: string };
  courses_enrolled: number;
  total_submissions: number;
  overall_avg: number;
  rank: number;
  total_students: number;
  course_progress: CourseProgress[];
  recent_submissions: Submission[];
}

/* ── Helpers ── */
const scoreColor = (s: number) =>
  s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";

const scoreBadge = (s: number) =>
  s >= 80 ? "badge-success" : s >= 60 ? "badge-warning" : "badge-danger";

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const formatDateShort = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function StudentAnalyticsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "courses" | "submissions">("overview");

  useEffect(() => {
    fetchAPI(`/instructor/students/${studentId}/detail`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  /* ── Derived data ── */
  const scoreTimeline = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.recent_submissions].sort(
      (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
    );
    return sorted.map((s, i) => ({
      label: formatDateShort(s.submitted_at),
      score: s.overall_score,
      avg: Math.round(sorted.slice(0, i + 1).reduce((sum, x) => sum + x.overall_score, 0) / (i + 1)),
    }));
  }, [data]);

  const scoreDistribution = useMemo(() => {
    if (!data) return [];
    const buckets: Record<string, number> = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    for (const s of data.recent_submissions) {
      if (s.overall_score <= 20) buckets["0-20"]++;
      else if (s.overall_score <= 40) buckets["21-40"]++;
      else if (s.overall_score <= 60) buckets["41-60"]++;
      else if (s.overall_score <= 80) buckets["61-80"]++;
      else buckets["81-100"]++;
    }
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [data]);

  const performanceMetrics = useMemo(() => {
    if (!data || data.recent_submissions.length === 0) return null;
    const scores = data.recent_submissions.map((s) => s.overall_score);
    const recent5 = scores.slice(0, Math.min(5, scores.length));
    const older5 = scores.slice(Math.min(5, scores.length), Math.min(10, scores.length));
    const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
    const olderAvg = older5.length > 0 ? older5.reduce((a, b) => a + b, 0) / older5.length : recentAvg;
    const trend = recentAvg - olderAvg;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);
    const consistency = scores.length > 1
      ? Math.round(100 - (Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - data.overall_avg, 2), 0) / scores.length)))
      : 100;

    return { trend: Math.round(trend), highest, lowest, consistency: Math.max(0, consistency) };
  }, [data]);

  const strengthsList = useMemo(() => {
    if (!data) return [];
    const map: Record<string, number> = {};
    for (const s of data.recent_submissions) {
      for (const str of s.strengths || []) {
        const key = str.slice(0, 60);
        map[key] = (map[key] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);
  }, [data]);

  const improvementsList = useMemo(() => {
    if (!data) return [];
    const map: Record<string, number> = {};
    for (const s of data.recent_submissions) {
      for (const imp of s.improvements || []) {
        const key = imp.slice(0, 60);
        map[key] = (map[key] || 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([text]) => text);
  }, [data]);

  /* ── Loading / Error ── */
  if (loading)
    return (
      <div style={{ padding: 60, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 15 }}>Loading student dashboard...</p>
      </div>
    );

  if (!data)
    return (
      <div style={{ padding: 60 }}>
        <Link href="/instructor/analytics" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-tertiary)", fontSize: 13, marginBottom: 24, textDecoration: "none" }}>
          <ArrowLeft size={14} /> Back to Analytics
        </Link>
        <p style={{ color: "var(--text-secondary)", marginTop: 20 }}>Student not found.</p>
      </div>
    );

  const { student, course_progress, recent_submissions } = data;

  const gradeColors: Record<string, string> = {
    "81-100": "#16A34A", "61-80": "#D97706", "41-60": "#F59E0B", "21-40": "#DC2626", "0-20": "#991B1B",
  };

  return (
    <div style={{ padding: "32px 48px 80px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Back link */}
      <Link
        href="/instructor/analytics"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-tertiary)", fontSize: 13, marginBottom: 28, textDecoration: "none", transition: "color 0.2s" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
      >
        <ArrowLeft size={14} /> Back to Analytics
      </Link>

      {/* ═══ Header ═══ */}
      <div className="animate-in animate-in-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <span className="overline" style={{ display: "block", marginBottom: 8 }}>STUDENT PROFILE</span>
          <h1 className="display-heading" style={{ fontSize: 34, marginBottom: 6 }}>{student.name}</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{student.email}</p>
          <p style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <Calendar size={12} />
            Joined {formatDate(student.created_at)}
          </p>
        </div>
        <div style={{ textAlign: "right", background: "var(--accent-subtle)", borderRadius: 16, padding: "20px 28px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 52, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>
            #{data.rank}
          </span>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            of {data.total_students} students
          </p>
        </div>
      </div>

      {/* ═══ Summary Cards ═══ */}
      <div className="animate-in animate-in-2" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { icon: <BookOpen size={15} />, label: "Courses", value: data.courses_enrolled, color: "var(--accent)" },
          { icon: <BarChart3 size={15} />, label: "Submissions", value: data.total_submissions, color: "var(--text-heading)" },
          { icon: <Trophy size={15} />, label: "Avg Score", value: `${data.overall_avg}%`, color: scoreColor(data.overall_avg) },
          { icon: <Target size={15} />, label: "Best Score", value: performanceMetrics ? `${performanceMetrics.highest}%` : "—", color: "var(--success)" },
          {
            icon: performanceMetrics && performanceMetrics.trend > 0
              ? <TrendingUp size={15} />
              : performanceMetrics && performanceMetrics.trend < 0
                ? <TrendingDown size={15} />
                : <Minus size={15} />,
            label: "Trend",
            value: performanceMetrics ? `${performanceMetrics.trend > 0 ? "+" : ""}${performanceMetrics.trend}%` : "—",
            color: performanceMetrics
              ? performanceMetrics.trend > 0 ? "var(--success)" : performanceMetrics.trend < 0 ? "var(--danger)" : "var(--text-secondary)"
              : "var(--text-secondary)",
          },
        ].map((m) => (
          <div key={m.label} className="card" style={{ padding: "18px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: "var(--text-tertiary)" }}>
              {m.icon}
              <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>{m.label}</span>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* ═══ Tab Navigation ═══ */}
      <div className="animate-in animate-in-3" style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {(["overview", "courses", "submissions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              textTransform: "capitalize",
              transition: "all 0.2s",
              marginBottom: -1,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ═══ TAB: Overview ═══ */}
      {activeTab === "overview" && (
        <div className="animate-in">
          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Score Timeline */}
            <div className="card" style={{ padding: "20px 24px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Score Timeline</h3>
              {scoreTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scoreTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number, name: string) => [
                        `${value}%`,
                        name === "score" ? "Score" : "Running Avg",
                      ]}
                    />
                    <Line type="monotone" dataKey="score" stroke="#D97706" strokeWidth={2} dot={{ r: 3, fill: "#D97706" }} name="score" />
                    <Line type="monotone" dataKey="avg" stroke="var(--text-tertiary)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="avg" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No submissions yet</p>
              )}
            </div>

            {/* Score Distribution */}
            <div className="card" style={{ padding: "20px 24px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Score Distribution</h3>
              {data.total_submissions > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scoreDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {scoreDistribution.map((entry, i) => (
                        <Cell key={i} fill={gradeColors[entry.range] || "#D97706"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13, padding: "40px 0", textAlign: "center" }}>No submissions yet</p>
              )}
            </div>
          </div>

          {/* Performance Insights + Quick Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            {/* Strengths */}
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Zap size={16} color="var(--success)" />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Strengths</h3>
              </div>
              {strengthsList.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {strengthsList.map((s, i) => (
                    <li key={i} style={{ padding: "8px 0", borderBottom: i < strengthsList.length - 1 ? "1px solid var(--border)" : "none", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: "var(--success)", fontWeight: 700, fontSize: 14, lineHeight: "20px" }}>+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No data available yet</p>
              )}
            </div>

            {/* Areas to Improve */}
            <div className="card" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Target size={16} color="var(--warning)" />
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Areas to Improve</h3>
              </div>
              {improvementsList.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {improvementsList.map((s, i) => (
                    <li key={i} style={{ padding: "8px 0", borderBottom: i < improvementsList.length - 1 ? "1px solid var(--border)" : "none", fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: "var(--warning)", fontWeight: 700, fontSize: 14, lineHeight: "20px" }}>!</span>
                      {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>No data available yet</p>
              )}
            </div>
          </div>

          {/* Last Activity */}
          {recent_submissions.length > 0 && (
            <div className="card" style={{ padding: "20px 24px" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Latest Submissions</h3>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {recent_submissions.slice(0, 5).map((sub, i) => (
                  <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < Math.min(recent_submissions.length, 5) - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: sub.overall_score >= 80 ? "var(--success-bg)" : sub.overall_score >= 60 ? "var(--warning-bg)" : "var(--danger-bg)" }}>
                        <Award size={16} color={scoreColor(sub.overall_score)} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-heading)" }}>{sub.assignment_id}</p>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{formatDate(sub.submitted_at)}</p>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, color: scoreColor(sub.overall_score) }}>
                        {sub.overall_score}%
                      </span>
                      <span className={`badge ${scoreBadge(sub.overall_score)}`} style={{ fontSize: 10 }}>
                        {sub.grade || (sub.overall_score >= 80 ? "Excellent" : sub.overall_score >= 60 ? "Good" : "Needs Work")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Courses ═══ */}
      {activeTab === "courses" && (
        <div className="animate-in">
          {course_progress.length === 0 ? (
            <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
              <BookOpen size={32} color="var(--text-tertiary)" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Not enrolled in any courses yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {course_progress.map((cp) => (
                <div key={cp.course_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* Course header row */}
                  <div
                    onClick={() => setExpandedCourse(expandedCourse === cp.course_id ? null : cp.course_id)}
                    style={{ display: "flex", alignItems: "center", padding: "18px 24px", cursor: "pointer", gap: 16, transition: "background 0.15s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-tertiary)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {expandedCourse === cp.course_id
                      ? <ChevronDown size={16} color="var(--accent)" />
                      : <ChevronRight size={16} color="var(--text-tertiary)" />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-heading)" }}>{cp.title}</h3>
                        <span className={`badge ${cp.difficulty === "Advanced" ? "badge-danger" : cp.difficulty === "Intermediate" ? "badge-warning" : "badge-success"}`} style={{ fontSize: 9 }}>
                          {cp.difficulty}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        {cp.submissions} submissions &middot; enrolled {formatDate(cp.enrolled_at)}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 80 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: scoreColor(cp.avg_score) }}>
                        {cp.avg_score}%
                      </span>
                      <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>avg score</p>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: 90, height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(cp.avg_score, 100)}%`, background: scoreColor(cp.avg_score), borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedCourse === cp.course_id && (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px", background: "var(--bg-primary)" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
                        <div>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Best Score</p>
                          <p style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", color: scoreColor(cp.best_score) }}>{cp.best_score}%</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Submissions</p>
                          <p style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--text-heading)" }}>{cp.submissions}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Status</p>
                          <span className={`badge ${cp.status === "published" ? "badge-success" : "badge-neutral"}`} style={{ fontSize: 10 }}>{cp.status}</span>
                        </div>
                        <div>
                          <p style={{ fontSize: 10, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Last Submission</p>
                          <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{formatDate(cp.latest_submission)}</p>
                        </div>
                      </div>

                      {/* Course-specific submissions */}
                      {recent_submissions.filter((s) => s.course_id === cp.course_id).length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, fontWeight: 600 }}>Submission History</p>
                          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Assignment</th>
                                  <th style={{ padding: "10px 16px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Date</th>
                                  <th style={{ padding: "10px 16px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Score</th>
                                  <th style={{ padding: "10px 16px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 10, textTransform: "uppercase" }}>Grade</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recent_submissions
                                  .filter((s) => s.course_id === cp.course_id)
                                  .slice(0, 10)
                                  .map((sub) => (
                                    <tr key={sub.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                      <td style={{ padding: "10px 16px", fontWeight: 500 }}>{sub.assignment_id}</td>
                                      <td style={{ padding: "10px 16px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatDate(sub.submitted_at)}</td>
                                      <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: scoreColor(sub.overall_score) }}>{sub.overall_score}%</td>
                                      <td style={{ padding: "10px 16px", textAlign: "right" }}>
                                        <span className={`badge ${scoreBadge(sub.overall_score)}`} style={{ fontSize: 9 }}>
                                          {sub.grade || "—"}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Submissions ═══ */}
      {activeTab === "submissions" && (
        <div className="animate-in">
          {recent_submissions.length === 0 ? (
            <div className="card" style={{ padding: "48px 24px", textAlign: "center" }}>
              <BarChart3 size={32} color="var(--text-tertiary)" style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>No submissions yet.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Assignment</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Course</th>
                    <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</th>
                    <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Score</th>
                    <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Grade</th>
                    <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_submissions.map((sub) => {
                    const course = course_progress.find((c) => c.course_id === sub.course_id);
                    return (
                      <tr key={sub.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 20px", fontWeight: 500 }}>{sub.assignment_id}</td>
                        <td style={{ padding: "12px 20px", color: "var(--text-secondary)", fontSize: 13 }}>{course?.title || sub.course_id}</td>
                        <td style={{ padding: "12px 20px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatDate(sub.submitted_at)}</td>
                        <td style={{ padding: "12px 20px", textAlign: "right" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: scoreColor(sub.overall_score) }}>{sub.overall_score}%</span>
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "right" }}>
                          <span className={`badge ${scoreBadge(sub.overall_score)}`} style={{ fontSize: 10 }}>
                            {sub.grade || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "right", maxWidth: 200 }}>
                          <p style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {sub.overall_feedback || "—"}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
