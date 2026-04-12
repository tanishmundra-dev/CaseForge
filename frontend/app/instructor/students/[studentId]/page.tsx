"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { ArrowLeft, BookOpen, Trophy, BarChart3, Clock, ChevronDown, ChevronRight } from "lucide-react";

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
  overall_score: number;
  grade: string;
  overall_feedback: string;
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

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  useEffect(() => {
    fetchAPI(`/instructor/students/${studentId}/detail`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div style={{ padding: 60 }}><p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading student data...</p></div>;
  if (!data) return <div style={{ padding: 60 }}><p style={{ color: "var(--text-secondary)" }}>Student not found.</p></div>;

  const { student, course_progress, recent_submissions } = data;
  const scoreColor = (s: number) => s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";

  return (
    <div style={{ padding: "48px 48px 80px", maxWidth: 1100, margin: "0 auto" }}>
      {/* Back + Header */}
      <Link href="/instructor/students" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-tertiary)", fontSize: 13, marginBottom: 24, textDecoration: "none" }}>
        <ArrowLeft size={14} /> Back to Students
      </Link>

      <div className="animate-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <h1 className="display-heading" style={{ fontSize: 32, marginBottom: 4 }}>{student.name}</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: 13, fontFamily: "var(--font-mono)" }}>{student.email}</p>
          <p style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 4 }}>Joined {new Date(student.created_at).toLocaleDateString()}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, color: "var(--accent)" }}>#{data.rank}</span>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>of {data.total_students} students</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="animate-in animate-in-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 32 }}>
        {[
          { icon: <BookOpen size={16} />, label: "Courses Enrolled", value: data.courses_enrolled, color: "var(--accent)" },
          { icon: <BarChart3 size={16} />, label: "Submissions", value: data.total_submissions, color: "var(--text-heading)" },
          { icon: <Trophy size={16} />, label: "Average Score", value: `${data.overall_avg}%`, color: scoreColor(data.overall_avg) },
          { icon: <Clock size={16} />, label: "Last Active", value: recent_submissions[0] ? new Date(recent_submissions[0].submitted_at).toLocaleDateString() : "—", color: "var(--text-secondary)" },
        ].map((m) => (
          <div key={m.label} className="card" style={{ padding: "20px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--text-tertiary)" }}>
              {m.icon}
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</span>
            </div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Course Progress */}
      <div className="animate-in animate-in-3">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Course Progress</h2>
        {course_progress.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>Not enrolled in any courses.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {course_progress.map((cp) => (
              <div key={cp.course_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  onClick={() => setExpandedCourse(expandedCourse === cp.course_id ? null : cp.course_id)}
                  style={{ display: "flex", alignItems: "center", padding: "16px 20px", cursor: "pointer", gap: 16 }}
                >
                  {expandedCourse === cp.course_id ? <ChevronDown size={16} color="var(--accent)" /> : <ChevronRight size={16} color="var(--text-tertiary)" />}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-heading)" }}>{cp.title}</h3>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {cp.submissions} submissions &middot; enrolled {cp.enrolled_at ? new Date(cp.enrolled_at).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: scoreColor(cp.avg_score) }}>{cp.avg_score}%</span>
                    <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>avg score</p>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: 80, height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(cp.avg_score, 100)}%`, background: scoreColor(cp.avg_score), borderRadius: 3 }} />
                  </div>
                </div>

                {expandedCourse === cp.course_id && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", background: "var(--bg-secondary)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Best Score</p>
                        <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)", color: scoreColor(cp.best_score) }}>{cp.best_score}%</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Difficulty</p>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>{cp.difficulty}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Last Submission</p>
                        <p style={{ fontSize: 14 }}>{cp.latest_submission ? new Date(cp.latest_submission).toLocaleDateString() : "—"}</p>
                      </div>
                    </div>
                    {/* Recent submissions for this course */}
                    {recent_submissions.filter((s) => s.course_id === cp.course_id).length > 0 && (
                      <div>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>Recent Submissions</p>
                        {recent_submissions.filter((s) => s.course_id === cp.course_id).slice(0, 5).map((sub) => (
                          <div key={sub.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                            <div>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>{sub.assignment_id}</span>
                              <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 8 }}>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: scoreColor(sub.overall_score) }}>{sub.overall_score}%</span>
                              <span className={`badge ${sub.overall_score >= 80 ? "badge-success" : sub.overall_score >= 60 ? "badge-warning" : "badge-danger"}`} style={{ fontSize: 10 }}>{sub.grade}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
