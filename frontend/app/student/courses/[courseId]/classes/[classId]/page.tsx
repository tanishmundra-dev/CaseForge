"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  ArrowRight, BookOpen, ChevronDown, ChevronUp, Play, FileText,
  Wrench, CheckCircle2, Circle, Clock, ExternalLink, CheckCheck,
} from "lucide-react";

function renderMarkdown(md: string): string {
  return md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre style="background:#1a1a18;color:#e8e4df;padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;font-family:var(--font-mono);margin:12px 0"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:13px;font-family:var(--font-mono)">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="font-family:var(--font-display);font-size:16px;font-weight:700;margin:20px 0 8px;color:var(--text-heading)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;margin:24px 0 10px;color:var(--text-heading)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-family:var(--font-display);font-size:22px;font-weight:700;margin:0 0 16px;color:var(--text-heading)">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:8px 0 8px 20px;list-style:disc">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    .replace(/\n/g, '<br/>')
    .replace(/^/, '<p style="margin:8px 0">')
    .replace(/$/, '</p>');
}

interface LearningUnit {
  type: string;
  title: string;
  duration: number;
  content: string;
  completion_type: string;
  video_url?: string;
  video_channel?: string;
}

interface Assignment {
  id: string; title: string; description: string; difficulty: string;
}

interface Resource {
  type?: string; title: string; url: string; description?: string; channel?: string; source?: string;
}

interface ClassDetail {
  course_id: string; course_title: string; week_number: number; week_title: string;
  id: string; number: number; title: string; description: string;
  theory_content?: string; learning_units?: LearningUnit[]; resource_links?: Resource[];
  assignments: Assignment[];
}

const unitIcons: Record<string, any> = {
  video: <Play size={16} />,
  reading: <BookOpen size={16} />,
  activity: <Wrench size={16} />,
  quiz: <FileText size={16} />,
};
const unitColors: Record<string, string> = {
  video: "#DC2626",
  reading: "#D97706",
  activity: "#16A34A",
  quiz: "#7C3AED",
};
const unitLabels: Record<string, string> = { video: "Video", reading: "Reading", activity: "Activity", quiz: "Quiz" };

function getYouTubeId(url: string): string | null {
  if (!url) return null;
  const match1 = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match1) return match1[1];
  const match2 = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (match2) return match2[1];
  const match3 = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (match3) return match3[1];
  return null;
}

function getYouTubeSearchEmbed(unit: any): string | null {
  // Priority: search query > video_url with valid ID > title-based search
  if (unit.video_search_query) {
    return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(unit.video_search_query)}`;
  }
  const ytId = getYouTubeId(unit.video_url || "");
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}?rel=0`;
  }
  // Fallback: search by unit title
  if (unit.type === "video" && unit.title) {
    return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(unit.title + " tutorial")}`;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   INLINE QUIZ — interactive, graded, auto-completes unit
   ═══════════════════════════════════════════════════════════ */
function InlineQuiz({ questions, unitIndex, courseId, classId, isDone, onComplete }: {
  questions: any[]; unitIndex: number; courseId: string; classId: string; isDone: boolean; onComplete: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const handleSubmit = async () => {
    let correct = 0;
    questions.forEach((q: any, i: number) => {
      if (q.type === "fill_up") {
        if ((answers[i] || "").toLowerCase().trim() === (q.answer || "").toLowerCase().trim()) correct++;
      } else {
        if (answers[i] === q.correct) correct++;
      }
    });
    const finalScore = Math.round((correct / Math.max(questions.length, 1)) * 100);
    const grade = finalScore >= 90 ? "A" : finalScore >= 80 ? "B+" : finalScore >= 70 ? "B" : finalScore >= 60 ? "C" : "D";
    setScore(finalScore);
    setSubmitted(true);

    // Save score to backend
    try {
      await fetchAPI("/trainee/submit", {
        method: "POST",
        body: JSON.stringify({
          course_id: courseId,
          class_id: classId,
          assignment_id: `unit-quiz-${unitIndex}`,
          assignment_type: "objective",
          score: finalScore,
          grade,
          answers,
        }),
      });
    } catch { /* silent */ }

    // Auto-complete the unit
    if (finalScore >= 0) onComplete();
  };

  const isCorrect = (qi: number) => {
    const q = questions[qi];
    if (q.type === "fill_up") return (answers[qi] || "").toLowerCase().trim() === (q.answer || "").toLowerCase().trim();
    return answers[qi] === q.correct;
  };

  return (
    <div>
      {/* Score banner */}
      {submitted && score !== null && (
        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 16,
          background: score >= 70 ? "rgba(22,163,74,0.08)" : score >= 40 ? "rgba(217,119,6,0.08)" : "rgba(220,38,38,0.08)",
          border: `1px solid ${score >= 70 ? "rgba(22,163,74,0.2)" : score >= 40 ? "rgba(217,119,6,0.2)" : "rgba(220,38,38,0.2)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)" }}>
              {score >= 70 ? "Great job!" : score >= 40 ? "Good attempt!" : "Keep studying!"}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
              {questions.filter((_, i) => isCorrect(i)).length}/{questions.length} correct
            </p>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, color: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)" }}>{score}%</span>
        </div>
      )}

      {/* Questions */}
      {questions.map((q: any, qi: number) => (
        <div key={qi} style={{
          padding: "14px 16px", borderRadius: 10, marginBottom: 8,
          border: `1.5px solid ${submitted ? (isCorrect(qi) ? "var(--success)" : "var(--danger)") : "var(--border)"}`,
          background: submitted ? (isCorrect(qi) ? "rgba(22,163,74,0.03)" : "rgba(220,38,38,0.03)") : "var(--bg-primary)",
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", marginRight: 6 }}>Q{qi + 1}</span>
            {q.question}
          </p>

          {q.type === "fill_up" ? (
            <div>
              <input
                className="input"
                value={answers[qi] || ""}
                onChange={(e) => setAnswers((p) => ({ ...p, [qi]: e.target.value }))}
                placeholder="Type your answer..."
                disabled={submitted}
                style={{ maxWidth: 300, ...(submitted ? { borderColor: isCorrect(qi) ? "var(--success)" : "var(--danger)" } : {}) }}
              />
              {submitted && !isCorrect(qi) && (
                <p style={{ fontSize: 12, color: "var(--success)", marginTop: 6 }}>Correct: <strong>{q.answer}</strong></p>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(q.options || []).map((opt: string, oi: number) => {
                const selected = answers[qi] === oi;
                const correct = submitted && oi === q.correct;
                const wrong = submitted && selected && oi !== q.correct;
                return (
                  <label
                    key={oi}
                    onClick={() => !submitted && setAnswers((p) => ({ ...p, [qi]: oi }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, cursor: submitted ? "default" : "pointer",
                      border: `1.5px solid ${correct ? "var(--success)" : wrong ? "var(--danger)" : selected ? "var(--accent)" : "var(--border)"}`,
                      background: correct ? "rgba(22,163,74,0.06)" : wrong ? "rgba(220,38,38,0.06)" : selected ? "rgba(217,119,6,0.06)" : "transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%",
                      border: `2px solid ${correct ? "var(--success)" : wrong ? "var(--danger)" : selected ? "var(--accent)" : "var(--border)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {(selected || correct) && <div style={{ width: 10, height: 10, borderRadius: "50%", background: correct ? "var(--success)" : wrong ? "var(--danger)" : "var(--accent)" }} />}
                    </div>
                    <span style={{ fontSize: 13, color: correct ? "var(--success)" : wrong ? "var(--danger)" : "var(--text-primary)" }}>{opt}</span>
                  </label>
                );
              })}
            </div>
          )}

          {submitted && q.explanation && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontStyle: "italic" }}>{q.explanation}</p>
          )}
        </div>
      ))}

      {/* Submit / Retry */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        {!submitted ? (
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={Object.keys(answers).length === 0}
            style={{ padding: "10px 24px", fontSize: 13 }}
          >
            Submit Quiz
          </button>
        ) : (
          <button
            className="btn-secondary"
            onClick={() => { setSubmitted(false); setAnswers({}); setScore(null); }}
            style={{ padding: "10px 24px", fontSize: 13 }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClassDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    fetchAPI(`/trainee/courses/${courseId}/classes/${classId}`)
      .then((data) => {
        setCls(data);
        // Auto-expand first unit
        if (data.learning_units?.length > 0) setExpandedUnit(0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, classId]);

  // Load progress
  useEffect(() => {
    fetchAPI(`/trainee/progress/class/${classId}`)
      .then((data) => {
        const done = new Set<number>();
        (data || []).forEach((p: any) => { if (p.completed) done.add(p.unit_index); });
        setCompleted(done);
      })
      .catch(() => {});
  }, [classId]);

  const toggleComplete = async (index: number) => {
    setToggling(index);
    try {
      const res = await fetchAPI("/trainee/progress/toggle", {
        method: "POST",
        body: JSON.stringify({ course_id: courseId, class_id: classId, unit_index: index }),
      });
      setCompleted((prev) => {
        const next = new Set(prev);
        res.completed ? next.add(index) : next.delete(index);
        return next;
      });
    } catch { /* silent */ }
    finally { setToggling(null); }
  };

  if (loading) return <div style={{ padding: "80px 48px", textAlign: "center" }}><span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>Loading class...</span></div>;
  if (!cls) return null;

  const units = cls.learning_units || [];
  const hasUnits = units.length > 0;
  const totalMins = units.reduce((s, u) => s + (u.duration || 0), 0);
  const completedCount = units.filter((_, i) => completed.has(i)).length;
  const progressPercent = hasUnits ? Math.round((completedCount / units.length) * 100) : 0;

  return (
    <div style={{ padding: "40px 48px 80px", maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb animate-in animate-in-1">
        <Link href="/student/courses">Courses</Link>
        <span className="separator">/</span>
        <Link href={`/student/courses/${courseId}`}>{cls.course_title}</Link>
        <span className="separator">/</span>
        <span className="current">{cls.title}</span>
      </div>

      {/* Header */}
      <div className="animate-in animate-in-1" style={{ marginBottom: 24 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
          WEEK {cls.week_number} &middot; CLASS {cls.number}
        </span>
        <h1 className="display-heading" style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>{cls.title}</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>{cls.description}</p>
      </div>

      {/* Progress bar */}
      {hasUnits && (
        <div className="animate-in animate-in-2" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading)" }}>{completedCount}/{units.length} units completed</span>
              {progressPercent === 100 && <CheckCheck size={16} color="var(--success)" />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} color="var(--text-tertiary)" />
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{totalMins} min total</span>
            </div>
          </div>
          <div style={{ height: 6, background: "var(--bg-tertiary)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPercent}%`, background: progressPercent === 100 ? "var(--success)" : "var(--accent)", borderRadius: 3, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      {/* Learning Units */}
      {hasUnits && (
        <div className="animate-in animate-in-2" style={{ marginBottom: 32 }}>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>LEARNING PATH</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {units.map((unit, ui) => {
              const isOpen = expandedUnit === ui;
              const isDone = completed.has(ui);
              const color = unitColors[unit.type] || "var(--text-tertiary)";

              return (
                <div key={ui} style={{ border: "1px solid var(--border)", borderRadius: isOpen ? 10 : 8, overflow: "hidden", background: isDone ? "rgba(22,163,74,0.03)" : "var(--bg-primary)" }}>
                  {/* Unit header */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => setExpandedUnit(isOpen ? null : ui)}
                  >
                    {/* Completion checkbox */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleComplete(ui); }}
                      disabled={toggling === ui}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, opacity: toggling === ui ? 0.5 : 1 }}
                    >
                      {isDone ? <CheckCircle2 size={20} color="var(--success)" /> : <Circle size={20} color="var(--border)" />}
                    </button>

                    {/* Type icon */}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
                      {unitIcons[unit.type] || <FileText size={16} />}
                    </div>

                    {/* Title */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isDone ? "var(--text-tertiary)" : "var(--text-heading)", textDecoration: isDone ? "line-through" : "none" }}>
                        {unit.title}
                      </span>
                    </div>

                    {/* Badges */}
                    <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: "uppercase", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {unitLabels[unit.type] || unit.type}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {unit.duration || "?"}m
                    </span>
                    {isOpen ? <ChevronUp size={14} color="var(--text-tertiary)" /> : <ChevronDown size={14} color="var(--text-tertiary)" />}
                  </div>

                  {/* Expanded content */}
                  {isOpen && (() => {
                    const embedUrl = getYouTubeSearchEmbed(unit);
                    return (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px 20px 60px", background: "var(--bg-secondary)" }}>
                      {/* YouTube thumbnail + link */}
                      {(unit.video_search_query || unit.video_url) && (() => {
                        const query = unit.video_search_query || unit.title || "";
                        const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                        return (
                          <a href={ytLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#DC262608", borderRadius: 10, border: "1px solid #DC262620", marginBottom: 16, textDecoration: "none", cursor: "pointer" }}>
                            <div style={{ width: 52, height: 52, borderRadius: 8, background: "#DC262615", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Play size={22} color="#DC2626" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 600, color: "#DC2626", marginBottom: 2 }}>Watch on YouTube</p>
                              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{unit.video_channel ? `${unit.video_channel} — ` : ""}{query}</p>
                            </div>
                            <ExternalLink size={14} color="var(--text-tertiary)" />
                          </a>
                        );
                      })()}

                      {/* Quiz unit — interactive */}
                      {unit.type === "quiz" && unit.questions && unit.questions.length > 0 ? (
                        <InlineQuiz
                          questions={unit.questions}
                          unitIndex={ui}
                          courseId={courseId}
                          classId={classId}
                          isDone={isDone}
                          onComplete={() => { if (!isDone) toggleComplete(ui); }}
                        />
                      ) : (
                        <>
                          {/* Content for non-quiz units */}
                          <div
                            style={{ fontSize: 15, lineHeight: 1.8, color: "var(--text-primary)" }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(unit.content || "") }}
                          />

                          {/* Mark complete button */}
                          <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => toggleComplete(ui)}
                              disabled={toggling === ui}
                              className={isDone ? "btn-secondary" : "btn-primary"}
                              style={{ padding: "8px 18px", fontSize: 13 }}
                            >
                              {isDone ? "Mark Incomplete" : "Mark Complete"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback: old-style theory content */}
      {!hasUnits && cls.theory_content && cls.theory_content.trim() && (
        <div className="animate-in animate-in-2" style={{ marginBottom: 32 }}>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>STUDY MATERIAL</span>
          <div className="card" style={{ padding: "28px 32px", fontSize: 15, lineHeight: 1.8, color: "var(--text-primary)" }}>
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(cls.theory_content) }} />
          </div>
        </div>
      )}

      {/* Resources — with inline YouTube search embeds */}
      {cls.resource_links && cls.resource_links.length > 0 && (() => {
        const videos = cls.resource_links.filter((r: any) => r.type === "video");
        const others = cls.resource_links.filter((r: any) => r.type !== "video");
        return (
        <div className="animate-in animate-in-3" style={{ marginBottom: 32 }}>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>RESOURCES</span>

          {/* Video thumbnails linking to YouTube */}
          {videos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: others.length > 0 ? 12 : 0 }}>
              {videos.map((res: any, ri: number) => {
                const query = res.video_search_query || res.title || "";
                const ytLink = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                return (
                  <a key={`v-${ri}`} href={ytLink} target="_blank" rel="noreferrer" className="card" style={{ padding: "14px 16px", textDecoration: "none", display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: "#DC262612", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Play size={20} color="#DC2626" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading)", lineHeight: 1.3, marginBottom: 2 }}>{res.title}</p>
                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{res.channel || res.source || "YouTube"}</p>
                    </div>
                    <ExternalLink size={13} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
                  </a>
                );
              })}
            </div>
          )}

          {/* Non-video resources (articles, docs) */}
          {others.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
              {others.map((res: any, ri: number) => (
                <a key={`o-${ri}`} href={res.url} target="_blank" rel="noreferrer" className="card" style={{ padding: "12px 14px", textDecoration: "none", display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: res.type === "docs" ? "var(--accent-subtle)" : "#0066FF12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                    {res.type === "docs" ? "📖" : "📝"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-heading)", lineHeight: 1.3 }}>{res.title}</p>
                    <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{res.channel || res.source || ""}</p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
        );
      })()}

      {/* Assignments */}
      <div className="animate-in animate-in-3">
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>ASSIGNMENTS</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cls.assignments.map((asn, i) => (
            <Link key={asn.id} href={`/student/courses/${courseId}/classes/${classId}/assignments/${asn.id}`} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, textDecoration: "none", cursor: "pointer" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "var(--accent)", opacity: 0.4, minWidth: 28, lineHeight: 1 }}>{i + 1}</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text-heading)", marginBottom: 2 }}>{asn.title}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.4 }}>{asn.description?.slice(0, 100)}{(asn.description?.length || 0) > 100 ? "..." : ""}</p>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>{asn.difficulty}</span>
              <ArrowRight size={14} color="var(--text-tertiary)" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
