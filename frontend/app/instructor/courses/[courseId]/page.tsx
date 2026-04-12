"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, BookOpen, Code, FileText, ExternalLink,
  Pencil, Upload, ArrowLeft, Loader2, Sparkles,
} from "lucide-react";

interface Assignment { title: string; description: string; type: string; difficulty: string; starter_code?: string; hints?: string[]; pitfalls?: string[]; aha_moment?: string; questions?: any[]; files?: any[]; test_cases?: any[]; rubric?: any[]; }
interface ClassItem { number: number; title: string; description: string; assignments: Assignment[]; references?: { title: string; url: string; description: string }[]; }
interface Week { number: number; title: string; classes: ClassItem[]; }
interface Course { id: string; title: string; description: string; difficulty: string; status: string; weeks: Week[]; }

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [selectedClass, setSelectedClass] = useState<{ week: number; class: number } | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    fetchAPI(`/instructor/courses/${courseId}`)
      .then((data: any) => {
        if (data?.weeks) {
          setCourse(data);
          // Auto-expand first week and select first class
          if (data.weeks.length > 0) {
            setExpandedWeeks(new Set([data.weeks[0].number]));
            if (data.weeks[0].classes?.length > 0) {
              setSelectedClass({ week: data.weeks[0].number, class: data.weeks[0].classes[0].number });
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  const toggleWeek = (n: number) => setExpandedWeeks((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });

  const getSelectedClassData = (): ClassItem | null => {
    if (!course || !selectedClass) return null;
    const week = course.weeks.find((w) => w.number === selectedClass.week);
    return week?.classes.find((c) => c.number === selectedClass.class) || null;
  };

  const handlePublish = async () => {
    if (!course) return;
    setPublishing(true);
    try {
      await fetchAPI(`/instructor/courses/${course.id}/publish`, { method: "POST" });
      setCourse((p) => p ? { ...p, status: "published" } : null);
    } catch {}
    finally { setPublishing(false); }
  };

  const cls = getSelectedClassData();
  const typeIcon = (t: string) => t === "objective" ? <FileText size={13} /> : <Code size={13} />;
  const typeLabel = (t: string) => t === "objective" ? "Quiz" : t === "ide" ? "Project" : "Coding";
  const typeBadge = (t: string) => t === "objective" ? "badge-warning" : t === "ide" ? "badge-accent" : "badge-neutral";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 56px)" }}>
      <Loader2 size={32} className="animate-pulse-slow" color="var(--accent)" />
    </div>
  );

  if (!course) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Course not found.</p>
      <Link href="/instructor/case-studies" style={{ color: "var(--accent)", marginTop: 12, display: "inline-block" }}>&larr; Back to courses</Link>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* ═══ SIDEBAR — Weeks & Classes ═══ */}
      <div style={{ width: 280, minWidth: 280, borderRight: "1px solid var(--border)", overflowY: "auto", background: "var(--bg-secondary)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/instructor/case-studies" style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
            <ArrowLeft size={12} /> All Courses
          </Link>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-heading)", lineHeight: 1.3, marginBottom: 8 }}>{course.title}</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={`badge ${course.status === "published" ? "badge-success" : "badge-warning"}`} style={{ fontSize: 10 }}>{course.status.toUpperCase()}</span>
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>{course.difficulty}</span>
          </div>
        </div>

        {/* Week list */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {course.weeks.map((week) => {
            const wOpen = expandedWeeks.has(week.number);
            return (
              <div key={week.number}>
                <div
                  onClick={() => toggleWeek(week.number)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", userSelect: "none", borderLeft: "3px solid transparent" }}
                >
                  {wOpen ? <ChevronDown size={14} color="var(--accent)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-subtle)", padding: "1px 6px", borderRadius: 3 }}>W{week.number}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{week.title}</span>
                </div>

                {wOpen && (
                  <div>
                    {week.classes.map((c) => {
                      const isSelected = selectedClass?.week === week.number && selectedClass?.class === c.number;
                      return (
                        <div
                          key={c.number}
                          onClick={() => setSelectedClass({ week: week.number, class: c.number })}
                          style={{
                            padding: "8px 16px 8px 44px", cursor: "pointer", fontSize: 13,
                            color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                            background: isSelected ? "var(--accent-subtle)" : "transparent",
                            borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                            fontWeight: isSelected ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginRight: 6, opacity: 0.5 }}>{c.number}.</span>
                          {c.title}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <Link
            href={`/instructor/mission-control?edit=${course.id}`}
            className="btn-secondary"
            style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}
          >
            <Sparkles size={13} /> Edit with AI
          </Link>
          {course.status === "draft" && (
            <button
              className="btn-primary"
              onClick={handlePublish}
              disabled={publishing}
              style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}
            >
              <Upload size={13} /> {publishing ? "..." : "Publish"}
            </button>
          )}
        </div>
      </div>

      {/* ═══ MAIN PANEL — Class Content ═══ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-primary)" }}>
        {!cls ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)" }}>
            Select a class from the sidebar
          </div>
        ) : (
          <div style={{ maxWidth: 800 }} className="animate-in">
            {/* Class header */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Week {selectedClass!.week} &middot; Class {cls.number}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h1 className="display-heading" style={{ fontSize: 26, marginTop: 6, marginBottom: 12 }}>{cls.title}</h1>
                <a href={`/instructor/classes/${cls.id}`} className="btn-secondary" style={{ padding: "4px 10px", fontSize: 11, marginTop: 4 }}>Edit Class</a>
              </div>

              {/* Description / Lecture Notes */}
              {cls.description && (
                <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <BookOpen size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                      {cls.description.length > 200 ? "Lecture Notes" : "Overview"}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{cls.description}</p>
                </div>
              )}
            </div>

            {/* Assignments */}
            {cls.assignments.map((asn, ai) => (
              <div key={ai} style={{ marginBottom: 20, padding: "20px 24px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  {typeIcon(asn.type)}
                  <h3 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{asn.title || "Untitled"}</h3>
                  <span className={`badge ${typeBadge(asn.type)}`} style={{ fontSize: 11 }}>{typeLabel(asn.type)}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>{asn.difficulty}</span>
                </div>

                {asn.description && <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>{asn.description}</p>}

                {/* Coding: starter code + test cases */}
                {asn.type === "coding" && (
                  <>
                    {asn.starter_code && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Starter Code</span>
                        <pre style={{ marginTop: 6, padding: "14px 16px", background: "#1a1a18", color: "#e8e4df", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.6 }}>{asn.starter_code}</pre>
                      </div>
                    )}
                    {asn.test_cases?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Test Cases</span>
                        {asn.test_cases.map((tc: any, ti: number) => (
                          <div key={ti} style={{ marginTop: 4, padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
                            <span style={{ color: "var(--text-tertiary)" }}>Input:</span> {tc.input || "—"} &rarr; <span style={{ color: "var(--success)" }}>{tc.expected_output}</span>
                            {tc.description && <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>({tc.description})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* IDE: files */}
                {asn.type === "ide" && asn.files?.map((f: any, fi: number) => (
                  <div key={fi} style={{ marginBottom: 10 }}>
                    <div style={{ display: "inline-block", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", padding: "4px 10px", background: "var(--bg-tertiary)", borderRadius: "6px 6px 0 0" }}>{f.name}</div>
                    <pre style={{ padding: "12px 16px", background: "#1a1a18", color: "#e8e4df", borderRadius: "0 8px 8px 8px", fontSize: 12, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.5 }}>{f.content}</pre>
                  </div>
                ))}

                {/* Quiz: questions */}
                {asn.type === "objective" && asn.questions?.length > 0 && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{asn.questions.length} Questions</span>
                    {asn.questions.map((q: any, qi: number) => (
                      <div key={qi} style={{ marginBottom: 12, padding: "12px 16px", background: "var(--bg-tertiary)", borderRadius: 6 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Q{qi + 1}. {q.question}</p>
                        {q.type === "mcq" && q.options?.map((opt: string, oi: number) => (
                          <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: oi === q.correct ? "var(--success)" : "var(--text-secondary)" }}>
                            <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${oi === q.correct ? "var(--success)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                              {String.fromCharCode(65 + oi)}
                            </span>
                            {opt} {oi === q.correct && <span style={{ fontSize: 10, color: "var(--success)" }}>(correct)</span>}
                          </div>
                        ))}
                        {q.type === "fill_up" && (
                          <p style={{ fontSize: 13, color: "var(--success)" }}>Answer: {q.answer}</p>
                        )}
                        {q.explanation && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6, fontStyle: "italic" }}>{q.explanation}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Rubric */}
                {asn.rubric?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Rubric</span>
                    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                      {asn.rubric.map((r: any, ri: number) => (
                        <div key={ri} style={{ padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: 4, fontSize: 12 }}>
                          <strong>{r.criterion}</strong> <span style={{ color: "var(--text-tertiary)" }}>({r.weight}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hints */}
                {asn.hints?.length > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}><strong>Hints:</strong> {asn.hints.join(" • ")}</p>
                )}
                {asn.aha_moment && (
                  <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}><strong>Key Insight:</strong> {asn.aha_moment}</p>
                )}
              </div>
            ))}

            {/* References */}
            {cls.references && cls.references.length > 0 && (
              <div style={{ padding: "16px 20px", background: "var(--accent-subtle)", borderRadius: 10, marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <BookOpen size={14} color="var(--accent)" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" }}>References</span>
                </div>
                {cls.references.map((ref, ri) => (
                  <div key={ri} style={{ marginBottom: 6 }}>
                    <a href={ref.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>
                      {ref.title} <ExternalLink size={10} style={{ verticalAlign: "middle" }} />
                    </a>
                    {ref.description && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{ref.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
