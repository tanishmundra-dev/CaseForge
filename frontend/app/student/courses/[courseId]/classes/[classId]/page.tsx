"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  ArrowRight, BookOpen, ChevronDown, ChevronUp, Play, FileText,
  Wrench, CheckCircle2, Circle, Clock, ExternalLink, CheckCheck,
  HelpCircle, Code2, Trophy,
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
  video_search_query?: string;
  video_channel?: string;
  questions?: any[];
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
  checkpoint_quiz: <HelpCircle size={16} />,
  checkpoint_coding: <Code2 size={16} />,
  graded_assignment: <Trophy size={16} />,
};
const unitColors: Record<string, string> = {
  video: "#DC2626",
  reading: "#D97706",
  activity: "#16A34A",
  quiz: "#7C3AED",
  checkpoint_quiz: "#7C3AED",
  checkpoint_coding: "#0EA5E9",
  graded_assignment: "#F59E0B",
};
const unitLabels: Record<string, string> = {
  video: "Video",
  reading: "Reading",
  activity: "Activity",
  quiz: "Quiz",
  checkpoint_quiz: "Checkpoint Quiz",
  checkpoint_coding: "Checkpoint: Code",
  graded_assignment: "Graded Assignment",
};
// Quiz-style units that should render the InlineQuiz interactive UI
const QUIZ_TYPES = new Set(["quiz", "checkpoint_quiz"]);

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
  // Priority: explicit URL (direct embed) > search query > title-based search
  const ytId = getYouTubeId(unit.youtube_url || unit.video_url || "");
  if (ytId) {
    return `https://www.youtube.com/embed/${ytId}?rel=0`;
  }
  if (unit.video_search_query) {
    return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(unit.video_search_query)}`;
  }
  // Fallback: search by unit title
  if (unit.type === "video" && unit.title) {
    return `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(unit.title + " tutorial")}`;
  }
  return null;
}

// Resolve the most appropriate link for a unit's video: prefer the saved URL
// (direct video), fall back to YouTube search for the saved query/title.
function getUnitVideoLink(unit: any): { href: string; label: string; direct: boolean } | null {
  const ytId = getYouTubeId(unit.youtube_url || unit.video_url || "");
  if (ytId) {
    return { href: `https://www.youtube.com/watch?v=${ytId}`, label: unit.video_channel || "YouTube", direct: true };
  }
  const directUrl = unit.youtube_url || unit.video_url;
  if (directUrl) {
    return { href: directUrl, label: unit.video_channel || "YouTube", direct: true };
  }
  const query = unit.video_search_query || (unit.type === "video" ? unit.title : "");
  if (query) {
    return { href: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, label: `Search: ${query}`, direct: false };
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   INLINE QUIZ — interactive, graded, auto-completes unit
   ═══════════════════════════════════════════════════════════ */
function InlineQuiz({ questions: rawQuestions, unitIndex, courseId, classId, isDone, onComplete }: {
  questions: any[]; unitIndex: number; courseId: string; classId: string; isDone: boolean; onComplete: () => void;
}) {
  // Normalize to a single shape so we can render either { id, text } objects OR plain strings,
  // and either correct_id (letter) OR correct (numeric index).
  const questions = (rawQuestions || []).map((q: any) => {
    if (!q || typeof q !== "object") return q;
    if (q.type === "fill_up") return q;
    const opts = (q.options || []).map((o: any) =>
      typeof o === "string" ? { id: o.slice(0, 6), text: o } : { id: o.id ?? "", text: o.text ?? String(o) }
    );
    let correctIndex = -1;
    if (typeof q.correct === "number") {
      correctIndex = q.correct;
    } else if (q.correct_id) {
      correctIndex = opts.findIndex((o: any) => o.id === q.correct_id);
    }
    return { ...q, options: opts, correct: correctIndex >= 0 ? correctIndex : 0 };
  });
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
      {questions.map((q: any, qi: number) => {
        const wasCorrect = submitted && isCorrect(qi);
        return (
        <div key={qi} style={{
          padding: "14px 16px", borderRadius: 10, marginBottom: 8,
          border: `1.5px solid ${submitted ? (wasCorrect ? "var(--success)" : "var(--danger)") : "var(--border)"}`,
          background: submitted ? (wasCorrect ? "rgba(22,163,74,0.03)" : "rgba(220,38,38,0.03)") : "var(--bg-primary)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>Q{qi + 1}</span>
            <p style={{ flex: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.5 }}>{q.question}</p>
            {submitted && (
              <span
                role="status"
                style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                  color: wasCorrect ? "var(--success)" : "var(--danger)",
                  background: wasCorrect ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
                  border: `1px solid ${wasCorrect ? "var(--success)" : "var(--danger)"}33`,
                  flexShrink: 0,
                }}
              >
                {wasCorrect ? "✓ Correct" : "✗ Incorrect"}
              </span>
            )}
          </div>

          {q.type === "fill_up" ? (
            <div>
              <input
                className="input"
                value={answers[qi] || ""}
                onChange={(e) => setAnswers((p) => ({ ...p, [qi]: e.target.value }))}
                placeholder="Type your answer..."
                disabled={submitted}
                style={{ maxWidth: 300, ...(submitted ? { borderColor: wasCorrect ? "var(--success)" : "var(--danger)" } : {}) }}
              />
              {submitted && (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", marginTop: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.08em", alignSelf: "center" }}>Your answer</span>
                  <span style={{ color: wasCorrect ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                    {answers[qi] ? String(answers[qi]) : <em style={{ fontWeight: 400, opacity: 0.7 }}>— no answer —</em>}
                  </span>
                  {!wasCorrect && (
                    <>
                      <span style={{ color: "var(--text-tertiary)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.08em", alignSelf: "center" }}>Correct answer</span>
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>{q.answer}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(q.options || []).map((opt: any, oi: number) => {
                const optText = typeof opt === "string" ? opt : (opt?.text ?? "");
                const selected = answers[qi] === oi;
                const correct = submitted && oi === q.correct;
                const wrong = submitted && selected && oi !== q.correct;
                const showYourAnswerTag = submitted && selected;
                const showCorrectAnswerTag = submitted && oi === q.correct;
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
                    <span style={{ fontSize: 13, color: correct ? "var(--success)" : wrong ? "var(--danger)" : "var(--text-primary)", flex: 1 }}>{optText}</span>
                    {showYourAnswerTag && (
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: wrong ? "var(--danger)" : "var(--success)", padding: "2px 7px", border: `1px solid ${wrong ? "var(--danger)" : "var(--success)"}55`, borderRadius: 999, flexShrink: 0 }}>
                        Your answer
                      </span>
                    )}
                    {showCorrectAnswerTag && !selected && (
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--success)", padding: "2px 7px", border: "1px solid var(--success)55", borderRadius: 999, flexShrink: 0 }}>
                        Correct answer
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {submitted && q.explanation && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontStyle: "italic" }}>{q.explanation}</p>
          )}
        </div>
        );
      })}

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
  const unitRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // When a unit expands, scroll its header toward the top of the viewport so
  // the newly-revealed content always flows DOWN from the click location —
  // avoids the "content opened above me, I have to scroll up" problem when
  // collapsing a prior unit shifts layout upward.
  const openUnit = (ui: number) => {
    const next = expandedUnit === ui ? null : ui;
    setExpandedUnit(next);
    if (next !== null) {
      // Defer to next frame so the DOM has the new expanded content before we measure.
      requestAnimationFrame(() => {
        const el = unitRefs.current[ui];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

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

  /* ───────────────────────────────────────────────
     SMART INTERLEAVING
     Decide after which unit each assignment should appear.
     Priority:
       1. Explicit `assignment.after_unit_index` from LLM (newest courses)
       2. Topic keyword match — place assignment after the unit whose title
          shares the most distinctive keywords with the assignment title
       3. Even distribution — if no signal, spread assignments evenly so
          each "chunk" of units ends with an assignment (e.g. 6u/2a → 3,6)
     ─────────────────────────────────────────────── */
  const STOPWORDS = new Set(["the","a","an","to","of","in","on","for","with","and","or","is","are","be","by","at","as","this","that","your","you","from","into","about","build","learn","using","use","how","what","why","make","create"]);
  function keywords(s: string): Set<string> {
    return new Set((s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOPWORDS.has(w)));
  }
  function placementIndex(asn: any, asnOrder: number, totalAsn: number, unitsArr: any[]): number {
    if (unitsArr.length === 0) return -1;
    // 1. Explicit hint
    if (typeof asn.after_unit_index === "number" && asn.after_unit_index >= 0 && asn.after_unit_index < unitsArr.length) {
      return asn.after_unit_index;
    }
    // 2. Topic match
    const asnKw = keywords(asn.title || "");
    let bestIdx = -1;
    let bestScore = 0;
    unitsArr.forEach((u, ui) => {
      const uKw = keywords((u.title || "") + " " + (u.content || "").slice(0, 500));
      let overlap = 0;
      for (const w of asnKw) if (uKw.has(w)) overlap++;
      if (overlap > bestScore) { bestScore = overlap; bestIdx = ui; }
    });
    if (bestScore >= 2) return bestIdx; // require >1 keyword overlap to trust
    // 3. Even distribution — final assignment ALWAYS caps the class
    const chunkSize = Math.max(1, Math.ceil(unitsArr.length / totalAsn));
    const evenIdx = Math.min(unitsArr.length - 1, (asnOrder + 1) * chunkSize - 1);
    return evenIdx;
  }

  const assignments = cls.assignments || [];
  // Compute a mapping: unit index → assignments that should appear right after it
  const assignmentsAfterUnit: Record<number, any[]> = {};
  const placedAssignmentIds = new Set<string>();
  if (hasUnits && assignments.length > 0) {
    assignments.forEach((asn: any, ai: number) => {
      const idx = placementIndex(asn, ai, assignments.length, units);
      if (idx >= 0) {
        if (!assignmentsAfterUnit[idx]) assignmentsAfterUnit[idx] = [];
        assignmentsAfterUnit[idx].push({ asn, order: ai });
        placedAssignmentIds.add(asn.id);
      }
    });
    // Safety: ensure no duplicates in sequence — dedupe by id per bucket
    Object.keys(assignmentsAfterUnit).forEach((k) => {
      const seen = new Set();
      assignmentsAfterUnit[+k] = assignmentsAfterUnit[+k].filter(({ asn }: any) => {
        if (seen.has(asn.id)) return false;
        seen.add(asn.id);
        return true;
      });
    });
  }
  // Any assignments NOT placed (e.g., interleaving disabled) render in a trailing section
  const trailingAssignments = assignments.filter((a: any) => !placedAssignmentIds.has(a.id));

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

              const afterThisUnit = assignmentsAfterUnit[ui] || [];
              return (
                <React.Fragment key={ui}>
                <div
                  ref={(el) => { unitRefs.current[ui] = el; }}
                  style={{ border: "1px solid var(--border)", borderRadius: isOpen ? 10 : 8, overflow: "hidden", background: isDone ? "rgba(22,163,74,0.03)" : "var(--bg-primary)", scrollMarginTop: 72 }}
                >
                  {/* Unit header */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", userSelect: "none" }}
                    onClick={() => openUnit(ui)}
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
                    const videoLink = getUnitVideoLink(unit);
                    const ytId = getYouTubeId(unit.youtube_url || unit.video_url || "");
                    return (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px 20px 60px", background: "var(--bg-secondary)" }}>
                      {/* Inline embed for direct video_url */}
                      {ytId && (
                        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, marginBottom: 16, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}?rel=0`}
                            title={unit.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                          />
                        </div>
                      )}

                      {/* YouTube link card (direct or search fallback) */}
                      {videoLink && (
                        <a href={videoLink.href} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#DC262608", borderRadius: 10, border: "1px solid #DC262620", marginBottom: 16, textDecoration: "none", cursor: "pointer" }}>
                          <div style={{ width: 52, height: 52, borderRadius: 8, background: "#DC262615", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Play size={22} color="#DC2626" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "#DC2626", marginBottom: 2 }}>
                              {videoLink.direct ? "Watch on YouTube" : "Search on YouTube"}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{videoLink.label}</p>
                          </div>
                          <ExternalLink size={14} color="var(--text-tertiary)" />
                        </a>
                      )}

                      {/* Quiz / checkpoint_quiz unit — interactive */}
                      {QUIZ_TYPES.has(unit.type) && unit.questions && unit.questions.length > 0 ? (
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
                {/* Assignments placed after this unit by smart interleaving */}
                {afterThisUnit.map(({ asn, order }: any) => (
                  <Link
                    key={`inline-asn-${asn.id}`}
                    href={`/student/courses/${courseId}/classes/${classId}/assignments/${asn.id}`}
                    className="card"
                    style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, textDecoration: "none", cursor: "pointer", borderLeft: "3px solid var(--accent)", background: "rgba(217,119,6,0.04)" }}
                  >
                    <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Assignment {order + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: "var(--text-heading)", marginBottom: 2 }}>{asn.title}</h3>
                      <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.4 }}>{asn.description?.slice(0, 100)}{(asn.description?.length || 0) > 100 ? "..." : ""}</p>
                    </div>
                    <span className="badge badge-neutral" style={{ fontSize: 10 }}>{asn.difficulty}</span>
                    <ArrowRight size={14} color="var(--accent)" />
                  </Link>
                ))}
                </React.Fragment>
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

      {/* Assignments section — only shown when there are NO units (so nothing to interleave with)
          or if some assignments couldn't be placed inline. */}
      {(!hasUnits ? cls.assignments : trailingAssignments).length > 0 && (
        <div className="animate-in animate-in-3" style={{ marginBottom: 32 }}>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>ASSIGNMENTS</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(!hasUnits ? cls.assignments : trailingAssignments).map((asn: any, i: number) => (
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
      )}

      {/* Resources — with inline YouTube search embeds */}
      {cls.resource_links && cls.resource_links.length > 0 && (() => {
        const videos = cls.resource_links.filter((r: any) => r.type === "video");
        const others = cls.resource_links.filter((r: any) => r.type !== "video");
        return (
        <div className="animate-in animate-in-3">
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
    </div>
  );
}
