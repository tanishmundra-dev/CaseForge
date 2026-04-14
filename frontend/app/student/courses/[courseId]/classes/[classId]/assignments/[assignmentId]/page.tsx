"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { Send, Play, Upload, X, ChevronDown, ChevronUp, CheckCircle, Circle, ArrowRight, ArrowLeft, Lightbulb, Lock } from "lucide-react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

/* ── Types ── */
interface AssignmentDetail {
  course_id: string; course_title: string; week_number: number;
  class_id: string; class_number: number; class_title: string;
  id: string; title: string; description: string; difficulty: string;
  type?: string; hints: string[]; pitfalls: string[]; aha_moment: string;
  starter_code: string; test_cases: any[]; rubric: any[];
  questions?: any[]; files?: any[];
}

interface GradingResult {
  overall_score: number; grade: string; criterion_scores: any[];
  overall_feedback: string; strengths: string[]; improvements: string[];
}

interface ChatMessage { role: "user" | "assistant"; content: string; }

function AssignmentRouter() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI(`/trainee/courses/${courseId}/classes/${classId}/assignments/${assignmentId}`)
      .then(setAssignment)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, classId, assignmentId]);

  if (loading) return <LoadingScreen />;
  if (!assignment) return <ErrorScreen />;

  const type = assignment.type || "coding";

  switch (type) {
    case "objective":
      return <QuizView assignment={assignment} courseId={courseId} classId={classId} />;
    case "ide":
      return <IDEView assignment={assignment} courseId={courseId} classId={classId} />;
    default:
      return <CodingSandbox assignment={assignment} courseId={courseId} classId={classId} assignmentId={assignmentId} />;
  }
}

/* ═══════════════════════════════════════════════════════════
   QUIZ VIEW — Light theme, inline MCQ + fill-up
   ═══════════════════════════════════════════════════════════ */
function QuizView({ assignment, courseId, classId }: { assignment: AssignmentDetail; courseId: string; classId: string }) {
  const questions = assignment.questions || [];
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setAnswer = (qi: number, val: any) => setAnswers((p) => ({ ...p, [qi]: val }));

  const handleSubmit = async () => {
    let correct = 0;
    questions.forEach((q: any, i: number) => {
      if (q.type === "mcq" && answers[i] === q.correct) correct++;
      if (q.type === "fill_up" && (answers[i] || "").toLowerCase().trim() === (q.answer || "").toLowerCase().trim()) correct++;
    });
    const finalScore = Math.round((correct / Math.max(questions.length, 1)) * 100);
    const grade = finalScore >= 90 ? "A" : finalScore >= 80 ? "B+" : finalScore >= 70 ? "B" : finalScore >= 60 ? "C" : finalScore >= 50 ? "D" : "F";
    setScore(finalScore);
    setSubmitted(true);

    // Persist quiz score to backend
    setSubmitting(true);
    try {
      await fetchAPI("/trainee/submit", {
        method: "POST",
        body: JSON.stringify({
          course_id: courseId,
          class_id: classId,
          assignment_id: assignment.id,
          assignment_type: "objective",
          score: finalScore,
          grade,
          answers,
        }),
      });
    } catch { /* silent — score is shown client-side regardless */ }
    finally { setSubmitting(false); }
  };

  const isCorrect = (qi: number) => {
    const q = questions[qi];
    if (q.type === "mcq") return answers[qi] === q.correct;
    if (q.type === "fill_up") return (answers[qi] || "").toLowerCase().trim() === (q.answer || "").toLowerCase().trim();
    return false;
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Breadcrumb assignment={assignment} courseId={courseId} classId={classId} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 80px" }}>
        {/* Header */}
        <div className="animate-in" style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <span className="badge badge-warning">QUIZ</span>
            <span className="badge badge-neutral">{assignment.difficulty}</span>
          </div>
          <h1 className="display-heading" style={{ fontSize: 28, marginBottom: 8 }}>{assignment.title}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>{assignment.description}</p>
        </div>

        {/* Score banner */}
        {submitted && score !== null && (
          <div className="animate-in" style={{ padding: "20px 24px", borderRadius: 12, marginBottom: 24, background: score >= 70 ? "var(--success-bg)" : score >= 40 ? "var(--warning-bg)" : "var(--danger-bg)", border: `1px solid ${score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)"}20`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)" }}>
                {score >= 70 ? "Great job!" : score >= 40 ? "Good attempt!" : "Keep practicing!"}
              </p>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                You got {Object.values(answers).filter((_, i) => isCorrect(i)).length} of {questions.length} correct
              </p>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 700, color: score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--danger)" }}>{score}%</span>
          </div>
        )}

        {/* Questions */}
        {questions.map((q: any, qi: number) => {
          const wasCorrect = submitted && isCorrect(qi);
          return (
          <div key={qi} className="card animate-in" style={{ padding: "20px 24px", marginBottom: 16, ...(submitted ? { borderColor: wasCorrect ? "var(--success)" : "var(--danger)", borderWidth: 2 } : {}) }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--accent)", opacity: 0.5, minWidth: 28 }}>{qi + 1}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
                  <p style={{ flex: 1, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>{q.question}</p>
                  {submitted && (
                    <span
                      role="status"
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
                        color: wasCorrect ? "var(--success)" : "var(--danger)",
                        background: wasCorrect ? "var(--success-bg)" : "var(--danger-bg)",
                        border: `1px solid ${wasCorrect ? "var(--success)" : "var(--danger)"}33`,
                        flexShrink: 0, whiteSpace: "nowrap",
                      }}
                    >
                      {wasCorrect ? "✓ Correct" : "✗ Incorrect"}
                    </span>
                  )}
                </div>

                {q.type === "mcq" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(q.options || []).map((opt: string, oi: number) => {
                      const selected = answers[qi] === oi;
                      const correct = submitted && oi === q.correct;
                      const wrong = submitted && selected && oi !== q.correct;
                      const showYourAnswerTag = submitted && selected;
                      const showCorrectAnswerTag = submitted && oi === q.correct;
                      return (
                        <label
                          key={oi}
                          onClick={() => !submitted && setAnswer(qi, oi)}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, cursor: submitted ? "default" : "pointer",
                            border: `1.5px solid ${correct ? "var(--success)" : wrong ? "var(--danger)" : selected ? "var(--accent)" : "var(--border)"}`,
                            background: correct ? "var(--success-bg)" : wrong ? "var(--danger-bg)" : selected ? "var(--accent-subtle)" : "transparent",
                            transition: "all 0.15s",
                          }}
                        >
                          {submitted ? (
                            correct ? <CheckCircle size={18} color="var(--success)" /> : wrong ? <X size={18} color="var(--danger)" /> : <Circle size={18} color="var(--border)" />
                          ) : (
                            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {selected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)" }} />}
                            </div>
                          )}
                          <span style={{ fontSize: 14, color: correct ? "var(--success)" : wrong ? "var(--danger)" : "var(--text-primary)", flex: 1 }}>{opt}</span>
                          {showYourAnswerTag && (
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: wrong ? "var(--danger)" : "var(--success)", padding: "2px 8px", border: `1px solid ${wrong ? "var(--danger)" : "var(--success)"}55`, borderRadius: 999, flexShrink: 0 }}>
                              Your answer
                            </span>
                          )}
                          {showCorrectAnswerTag && !selected && (
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--success)", padding: "2px 8px", border: "1px solid var(--success)55", borderRadius: 999, flexShrink: 0 }}>
                              Correct answer
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === "fill_up" && (
                  <div>
                    <input
                      className="input"
                      value={answers[qi] || ""}
                      onChange={(e) => setAnswer(qi, e.target.value)}
                      placeholder="Type your answer..."
                      disabled={submitted}
                      style={{ maxWidth: 400, ...(submitted ? { borderColor: wasCorrect ? "var(--success)" : "var(--danger)" } : {}) }}
                    />
                    {submitted && (
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 12px", marginTop: 10, fontSize: 13 }}>
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
                )}

                {submitted && q.explanation && (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, fontStyle: "italic", borderTop: "1px solid var(--border)", paddingTop: 8 }}>{q.explanation}</p>
                )}
              </div>
            </div>
          </div>
          );
        })}

        {/* Submit */}
        {!submitted ? (
          <button className="btn-primary" onClick={handleSubmit} disabled={Object.keys(answers).length === 0} style={{ width: "100%", padding: "14px 0", marginTop: 8 }}>
            Submit Quiz <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => { setSubmitted(false); setAnswers({}); setScore(null); }} style={{ width: "100%", padding: "14px 0", marginTop: 8 }}>
            Retry Quiz
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   IDE VIEW — Multi-file tabbed editor (dark theme)
   ═══════════════════════════════════════════════════════════ */
function IDEView({ assignment, courseId, classId }: { assignment: AssignmentDetail; courseId: string; classId: string }) {
  const files = assignment.files || [{ name: "main.js", content: assignment.starter_code || "// Write your code", language: "javascript" }];
  const [activeFile, setActiveFile] = useState(0);
  const [fileContents, setFileContents] = useState<Record<number, string>>(
    Object.fromEntries(files.map((f: any, i: number) => [i, f.content || ""]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);

  const langMap: Record<string, string> = { html: "html", css: "css", js: "javascript", javascript: "javascript", py: "python", python: "python", ts: "typescript", json: "json" };
  const getLang = (f: any) => langMap[f.language] || langMap[f.name?.split(".").pop() || ""] || "plaintext";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const code = Object.values(fileContents).join("\n\n// --- FILE SEPARATOR ---\n\n");
      const data = await fetchAPI("/trainee/submit", {
        method: "POST",
        body: JSON.stringify({ course_id: courseId, class_id: classId, assignment_id: assignment.id, code, assignment_type: "coding" }),
      });
      setResult(data);
    } catch { alert("Submission failed."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="theme-dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <Breadcrumb assignment={assignment} courseId={courseId} classId={classId} dark />

      <div style={{ display: "flex", height: "calc(100vh - 44px)" }}>
        {/* Left — Brief */}
        <div style={{ width: "25%", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "20px 16px", background: "var(--bg-secondary)" }}>
          <span className="overline" style={{ display: "block", marginBottom: 8 }}>PROJECT</span>
          <h2 className="display-heading" style={{ fontSize: 17, marginBottom: 8 }}>{assignment.title}</h2>
          <span className="badge badge-accent" style={{ marginBottom: 12 }}>{assignment.difficulty}</span>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>{assignment.description}</p>
          {assignment.hints?.length > 0 && (
            <div style={{ borderLeft: "2px solid var(--accent)", padding: "6px 10px", background: "var(--accent-subtle)", borderRadius: "0 6px 6px 0", marginBottom: 8 }}>
              <span style={{ fontSize: 10, textTransform: "uppercase", color: "var(--accent)", fontWeight: 700 }}>Hints</span>
              {assignment.hints.map((h, i) => <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{h}</p>)}
            </div>
          )}
        </div>

        {/* Center — Multi-file Editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* File tabs */}
          <div style={{ display: "flex", background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)" }}>
            {files.map((f: any, i: number) => (
              <button
                key={i}
                onClick={() => setActiveFile(i)}
                style={{
                  padding: "8px 16px", fontSize: 12, fontFamily: "var(--font-mono)", border: "none", cursor: "pointer",
                  background: activeFile === i ? "var(--bg-primary)" : "transparent",
                  color: activeFile === i ? "var(--accent)" : "var(--text-tertiary)",
                  borderBottom: activeFile === i ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                {f.name}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              language={getLang(files[activeFile])}
              theme="vs-dark"
              value={fileContents[activeFile] || ""}
              onChange={(v) => setFileContents((p) => ({ ...p, [activeFile]: v || "" }))}
              options={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false }}
            />
          </div>

          {/* Bottom bar */}
          <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <div style={{ flex: 1, fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center" }}>
              {files.length} files
            </div>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ padding: "8px 20px" }}>
              <Upload size={14} /> {submitting ? "Submitting..." : "Submit Project"}
            </button>
          </div>
        </div>
      </div>

      {/* Grading overlay */}
      {result && <GradingOverlay result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CODING SANDBOX — Existing, untouched logic
   ═══════════════════════════════════════════════════════════ */
function detectLanguage(courseTitle: string, starterCode: string): { language: string; monacoLang: string; filename: string } {
  const ctx = (courseTitle || "").toLowerCase();
  if (/node|javascript|express|react|vue|angular|typescript|next/.test(ctx)) {
    return { language: "javascript", monacoLang: "javascript", filename: "solution.js" };
  }
  if (/java(?!script)/.test(ctx) && !/javascript/.test(ctx)) {
    return { language: "java", monacoLang: "java", filename: "Solution.java" };
  }
  if (/go\b|golang/.test(ctx)) {
    return { language: "go", monacoLang: "go", filename: "solution.go" };
  }
  if (/rust/.test(ctx)) {
    return { language: "rust", monacoLang: "rust", filename: "solution.rs" };
  }
  if (/c\+\+|cpp/.test(ctx)) {
    return { language: "cpp", monacoLang: "cpp", filename: "solution.cpp" };
  }
  // Fallback: detect from starter code
  if (starterCode) {
    if (/function\s|const\s|let\s|var\s|console\.log|require\(|import\s.*from/.test(starterCode)) {
      return { language: "javascript", monacoLang: "javascript", filename: "solution.js" };
    }
  }
  return { language: "python", monacoLang: "python", filename: "solution.py" };
}

function CodingSandbox({ assignment, courseId, classId, assignmentId }: { assignment: AssignmentDetail; courseId: string; classId: string; assignmentId: string }) {
  const langInfo = detectLanguage(assignment.course_title, assignment.starter_code);
  const [code, setCode] = useState(assignment.starter_code || (langInfo.language === "javascript" ? "// Write your solution here\n" : "# Write your solution here\n"));
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [solutionCode, setSolutionCode] = useState<string | null>(null);
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "I can see your assignment and code. Ask me anything — I'll guide you without spoiling the solution." }]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [leftTab, setLeftTab] = useState<"description" | "hints" | "companion">("description");
  const [bottomTab, setBottomTab] = useState<"tests" | "console">("tests");
  const [bottomOpen, setBottomOpen] = useState(false);

  const handleGetSolution = async () => {
    if (!confirm("Load the reference solution into the editor? This will replace your current code.")) return;
    if (solutionCode) { setCode(solutionCode); return; }
    setSolutionLoading(true);
    try {
      const data = await fetchAPI(`/trainee/assignments/${assignmentId}/solution`);
      const sc = data.solution_code || "// No solution available";
      setSolutionCode(sc);
      setCode(sc);
    } catch { alert("Failed to load solution."); }
    finally { setSolutionLoading(false); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-monitor: debounced code analysis — if student pauses 5s after writing 50+ chars, AI checks for issues
  const lastCodeRef = useRef(code);
  useEffect(() => {
    if (code === lastCodeRef.current) return;
    if (code.trim().length < 50) return;
    lastCodeRef.current = code;

    const timer = setTimeout(async () => {
      if (chatLoading) return;
      // Only auto-hint if the code has changed significantly and has potential issues
      try {
        const d = await fetchAPI("/trainee/companion/chat", {
          method: "POST",
          body: JSON.stringify({
            messages: [{ role: "user", content: "[AUTO] The student is working on their code. Analyze the current code for any obvious bugs, syntax errors, or suboptimal approaches. If you see an issue, give a SHORT hint (1-2 sentences). If the code looks fine so far, respond with exactly: __SKIP__" }],
            assignment,
            current_code: code,
          }),
        });
        if (d.content && !d.content.includes("__SKIP__") && d.content.length > 10) {
          setMessages((p) => [...p, { role: "assistant", content: d.content }]);
        }
      } catch { /* silent */ }
    }, 5000);
    return () => clearTimeout(timer);
  }, [code, assignment, chatLoading]);

  const handleRun = async () => {
    setRunning(true); setRunOutput(null); setBottomTab("console"); setBottomOpen(true);
    try { const r = await fetchAPI("/trainee/run", { method: "POST", body: JSON.stringify({ code, language: langInfo.language }) }); setRunOutput({ stdout: r.stdout || "", stderr: r.stderr || "" }); }
    catch { setRunOutput({ stdout: "", stderr: "Failed to execute." }); }
    finally { setRunning(false); }
  };

  const handleSubmit = async () => {
    setSubmitting(true); setResult(null); setBottomTab("tests"); setBottomOpen(true);
    try { const d = await fetchAPI("/trainee/submit", { method: "POST", body: JSON.stringify({ course_id: courseId, class_id: classId, assignment_id: assignmentId, code, assignment_type: "coding", language: langInfo.language }) }); setResult(d); }
    catch { setResult({ overall_score: 0, grade: "F", criterion_scores: [], overall_feedback: "Submission failed. Please try again.", strengths: [], improvements: [] }); }
    finally { setSubmitting(false); }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updated = [...messages, userMsg]; setMessages(updated); setChatInput(""); setChatLoading(true);
    try { const d = await fetchAPI("/trainee/companion/chat", { method: "POST", body: JSON.stringify({ messages: updated.map((m) => ({ role: m.role, content: m.content })), assignment, current_code: code }) }); setMessages((p) => [...p, { role: "assistant", content: d.content }]); }
    catch { setMessages((p) => [...p, { role: "assistant", content: "Sorry, something went wrong." }]); }
    finally { setChatLoading(false); }
  };

  const scoreColor = (s: number) => s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";

  const hints = assignment.hints || [];
  const pitfalls = assignment.pitfalls || [];
  const testCases = assignment.test_cases || [];
  const visibleCases = testCases.filter((tc: any) => !tc.is_hidden);
  const accepted = !!result && result.overall_score >= 80;
  const diff = (assignment.difficulty || "").toLowerCase();
  const badgeClass = diff.includes("easy") || diff.includes("begin") ? "badge-success" : diff.includes("hard") || diff.includes("advanced") ? "badge-danger" : "badge-warning";

  return (
    <div className="theme-dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ═══ TOP BAR ═══ */}
      <div style={{ height: 52, borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <Link href={`/student/courses/${courseId}/classes/${classId}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, color: "var(--text-secondary)", border: "1px solid var(--border)", flexShrink: 0, textDecoration: "none" }} aria-label="Back">
            <ArrowLeft size={15} />
          </Link>
          <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{assignment.class_title}</span>
            <span style={{ color: "var(--text-tertiary)" }}>/</span>
            <span className="display-heading" style={{ fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{assignment.title}</span>
          </div>
          <span className={`badge ${badgeClass}`} style={{ flexShrink: 0 }}>{assignment.difficulty}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button onClick={handleGetSolution} disabled={solutionLoading || running || submitting} style={{ padding: "7px 14px", fontSize: 13, borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
            {solutionLoading ? "Loading..." : "Get Solution"}
          </button>
          <button className="btn-secondary" onClick={handleRun} disabled={running || submitting}>
            <Play size={14} /> {running ? "Running..." : "Run Code"}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={running || submitting}>
            <Upload size={14} /> {submitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>

      {/* ═══ 2-PANEL AREA ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── LEFT PANEL (40%) ── */}
        <div style={{ width: "40%", minWidth: 360, borderRight: "1px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            {([
              { id: "description", label: "Description" },
              { id: "hints", label: "Hints" },
              { id: "companion", label: "AI Companion" },
            ] as const).map((t) => {
              const active = leftTab === t.id;
              return (
                <button key={t.id} onClick={() => setLeftTab(t.id)} style={{ background: "transparent", border: "none", padding: "12px 18px", fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "var(--accent)" : "var(--text-secondary)", borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`, cursor: "pointer", fontFamily: "var(--font-body)", marginBottom: -1 }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {leftTab === "description" && (
              <div style={{ padding: "22px 20px" }}>
                <h2 className="display-heading" style={{ fontSize: 20, marginBottom: 12 }}>{assignment.title}</h2>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 20, whiteSpace: "pre-wrap" }}>{assignment.description}</p>

                {visibleCases.length > 0 && (
                  <>
                    <span className="overline" style={{ display: "block", marginBottom: 10 }}>Examples</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                      {visibleCases.map((tc: any, i: number) => (
                        <div key={i} style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>
                            Example {i + 1}{tc.description ? ` — ${tc.description}` : ""}
                          </div>
                          {tc.input != null && tc.input !== "" && (
                            <div style={{ marginTop: 4 }}>
                              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8, textTransform: "uppercase" }}>Input:</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>{String(tc.input)}</span>
                            </div>
                          )}
                          <div style={{ marginTop: 4 }}>
                            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginRight: 8, textTransform: "uppercase" }}>Output:</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--success)" }}>{String(tc.expected_output)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {pitfalls.length > 0 && (
                  <div style={{ borderLeft: "3px solid var(--danger)", background: "var(--danger-bg)", padding: "12px 14px", borderRadius: "0 8px 8px 0", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--danger)", fontWeight: 700, marginBottom: 6 }}>Pitfalls</div>
                    {pitfalls.map((p: string, i: number) => (
                      <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginTop: i === 0 ? 0 : 4 }}>{p}</p>
                    ))}
                  </div>
                )}

                {assignment.aha_moment && (
                  <div style={{ borderLeft: "3px solid var(--success)", background: "var(--success-bg)", padding: "12px 14px", borderRadius: "0 8px 8px 0" }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--success)", fontWeight: 700, marginBottom: 6 }}>Key Insight</div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{assignment.aha_moment}</p>
                  </div>
                )}
              </div>
            )}

            {leftTab === "hints" && (
              <div style={{ padding: "22px 20px" }}>
                {hints.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No hints available. Try the AI Companion tab.</p>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      {hints.map((h: string, i: number) => {
                        const revealed = i < hintsRevealed;
                        return (
                          <div key={i} style={{ border: "1px solid var(--border)", borderLeft: `3px solid ${revealed ? "var(--accent)" : "var(--border)"}`, background: revealed ? "var(--accent-subtle)" : "var(--bg-tertiary)", padding: "12px 14px", borderRadius: "0 10px 10px 0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: revealed ? 6 : 0 }}>
                              {revealed ? <Lightbulb size={13} color="var(--accent)" /> : <Lock size={13} color="var(--text-tertiary)" />}
                              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: revealed ? "var(--accent)" : "var(--text-tertiary)" }}>Hint {i + 1}</span>
                            </div>
                            {revealed && <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{h}</p>}
                          </div>
                        );
                      })}
                    </div>
                    {hintsRevealed < hints.length && (
                      <button className="btn-secondary" onClick={() => setHintsRevealed((r) => Math.min(r + 1, hints.length))} style={{ width: "100%" }}>
                        <Lightbulb size={14} /> Reveal hint {hintsRevealed + 1} of {hints.length}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {leftTab === "companion" && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                      <div style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", ...(msg.role === "user" ? { background: "var(--accent)", color: "#fff", borderBottomRightRadius: 4 } : { background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderBottomLeftRadius: 4 }) }}>{msg.content}</div>
                    </div>
                  ))}
                  {chatLoading && <span className="animate-pulse-slow" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Thinking...</span>}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0 }}>
                  <textarea className="input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }} placeholder="Ask your companion..." rows={2} style={{ resize: "none", flex: 1, fontSize: 13 }} />
                  <button className="btn-primary" onClick={handleChat} disabled={chatLoading || !chatInput.trim()} style={{ padding: "10px 12px" }} aria-label="Send"><Send size={14} /></button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL (60%) ── */}
        <div style={{ width: "60%", minWidth: 480, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* File tab */}
          <div style={{ background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
            {langInfo.filename}
          </div>

          {/* Monaco editor — shrinks when bottom panel opens */}
          <div style={{ flex: bottomOpen ? 0.65 : 1, minHeight: 0 }}>
            <Editor height="100%" language={langInfo.monacoLang} theme="vs-dark" value={code} onChange={(v) => setCode(v || "")} options={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false, lineNumbers: "on", renderLineHighlight: "gutter" }} />
          </div>

          {/* Bottom panel — collapsed bar by default */}
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", flexGrow: bottomOpen ? 0.35 : 0, flexShrink: 0, flexBasis: bottomOpen ? "0%" : "auto", minHeight: bottomOpen ? 160 : "auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: bottomOpen ? "1px solid var(--border)" : "none", flexShrink: 0 }}>
              <div style={{ display: "flex" }}>
                {(["tests", "console"] as const).map((t) => {
                  const active = bottomTab === t;
                  const label = t === "tests" ? "Test Results" : "Console";
                  return (
                    <button key={t} onClick={() => { setBottomTab(t); setBottomOpen(true); }} style={{ background: "transparent", border: "none", padding: "10px 16px", fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "var(--accent)" : "var(--text-secondary)", borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`, cursor: "pointer", fontFamily: "var(--font-body)", marginBottom: -1, display: "flex", alignItems: "center", gap: 6 }}>
                      {label}
                      {t === "tests" && result && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: scoreColor(result.overall_score) }}>{result.overall_score}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setBottomOpen((o) => !o)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "0 16px", height: 38, display: "flex", alignItems: "center" }} aria-label={bottomOpen ? "Collapse" : "Expand"}>
                {bottomOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
            </div>

            {/* Body */}
            {bottomOpen && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                {bottomTab === "console" && (
                  running ? (
                    <div style={{ padding: "16px 18px" }}>
                      <span className="animate-pulse-slow" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>Running...</span>
                    </div>
                  ) : !runOutput ? (
                    <div style={{ padding: "16px 18px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
                        Click <strong style={{ color: "var(--text-secondary)" }}>Run Code</strong> to see output.
                      </span>
                    </div>
                  ) : (
                    <div style={{ padding: "14px 18px" }}>
                      {runOutput.stdout && <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)", whiteSpace: "pre-wrap", wordBreak: "break-all", marginBottom: runOutput.stderr ? 10 : 0 }}>{runOutput.stdout}</pre>}
                      {runOutput.stderr && <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--danger)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{runOutput.stderr}</pre>}
                      {!runOutput.stdout && !runOutput.stderr && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>(no output)</span>
                      )}
                    </div>
                  )
                )}

                {bottomTab === "tests" && (
                  submitting ? (
                    <div style={{ padding: "20px 18px" }}>
                      <span className="animate-pulse-slow" style={{ fontSize: 13, color: "var(--text-secondary)" }}>Evaluating submission...</span>
                    </div>
                  ) : !result ? (
                    <div style={{ padding: "16px 18px" }}>
                      <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                        {testCases.length > 0 ? `${testCases.length} test case${testCases.length === 1 ? "" : "s"} · ` : ""}
                        Click <strong style={{ color: "var(--text-secondary)" }}>Submit</strong> to evaluate.
                      </span>
                      {visibleCases.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                          {visibleCases.map((tc: any, i: number) => (
                            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, background: "var(--bg-tertiary)" }}>
                              <span style={{ color: "var(--text-tertiary)" }}>Case {i + 1}{tc.description ? `: ${tc.description}` : ""}</span>
                              <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 3, fontSize: 11 }}>
                                Expected: <span style={{ color: "var(--success)" }}>{tc.expected_output}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 10, background: accepted ? "var(--success-bg)" : "var(--danger-bg)", border: `1px solid ${accepted ? "var(--success)" : "var(--danger)"}`, marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {accepted ? <CheckCircle size={18} color="var(--success)" /> : <X size={18} color="var(--danger)" />}
                          <div>
                            <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: accepted ? "var(--success)" : "var(--danger)" }}>
                              {accepted ? "Accepted" : "Needs Work"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                              Score: {result.overall_score} · Grade: {result.grade}
                            </div>
                          </div>
                        </div>
                      </div>

                      {result.overall_feedback && (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 14 }}>{result.overall_feedback}</p>
                      )}

                      {result.criterion_scores?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <span className="overline" style={{ display: "block", marginBottom: 8 }}>Criteria</span>
                          {result.criterion_scores.map((cs: any, i: number) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{cs.criterion}</span>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: scoreColor(cs.score) }}>{cs.score}%</span>
                              </div>
                              <div style={{ height: 3, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${cs.score}%`, background: scoreColor(cs.score), borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {result.strengths?.length > 0 && (
                        <div style={{ marginBottom: 10, borderLeft: "3px solid var(--success)", background: "var(--success-bg)", padding: "10px 12px", borderRadius: "0 8px 8px 0" }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "var(--success)", marginBottom: 4 }}>Strengths</div>
                          {result.strengths.map((s: string, i: number) => (
                            <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: i === 0 ? 0 : 4, lineHeight: 1.5 }}>· {s}</p>
                          ))}
                        </div>
                      )}

                      {result.improvements?.length > 0 && (
                        <div style={{ borderLeft: "3px solid var(--warning)", background: "var(--warning-bg)", padding: "10px 12px", borderRadius: "0 8px 8px 0" }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "var(--warning)", marginBottom: 4 }}>Improvements</div>
                          {result.improvements.map((s: string, i: number) => (
                            <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: i === 0 ? 0 : 4, lineHeight: 1.5 }}>· {s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function Breadcrumb({ assignment, courseId, classId, dark }: { assignment: AssignmentDetail; courseId: string; classId: string; dark?: boolean }) {
  return (
    <div style={{ height: 44, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 20px", gap: 8, fontSize: 13, background: dark ? "var(--bg-secondary)" : "var(--bg-secondary)" }}>
      <Link href="/student/courses" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>Courses</Link>
      <span style={{ color: "var(--text-tertiary)" }}>/</span>
      <Link href={`/student/courses/${courseId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>{assignment.course_title}</Link>
      <span style={{ color: "var(--text-tertiary)" }}>/</span>
      <Link href={`/student/courses/${courseId}/classes/${classId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>{assignment.class_title}</Link>
      <span style={{ color: "var(--text-tertiary)" }}>/</span>
      <span style={{ color: "var(--accent)", fontWeight: 600 }}>{assignment.title}</span>
    </div>
  );
}

function GradingOverlay({ result, onClose }: { result: GradingResult; onClose: () => void }) {
  const scoreColor = (s: number) => s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 16, padding: "40px 44px", maxWidth: 560, width: "90%", maxHeight: "85vh", overflowY: "auto", animation: "fadeInUp 0.4s ease forwards" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>{result.overall_score}</span>
        <span className={`badge ${result.overall_score >= 80 ? "badge-success" : result.overall_score >= 60 ? "badge-warning" : "badge-danger"}`} style={{ marginLeft: 12, verticalAlign: "super" }}>{result.grade}</span>
      </div>
      <div style={{ height: 1, background: "var(--border)", marginBottom: 24 }} />
      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>{result.overall_feedback}</p>
      {result.criterion_scores?.map((cs: any, i: number) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{cs.criterion}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: scoreColor(cs.score) }}>{cs.score}%</span>
          </div>
          <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${cs.score}%`, background: scoreColor(cs.score), borderRadius: 2 }} />
          </div>
        </div>
      ))}
      <button className="btn-secondary" onClick={onClose} style={{ width: "100%", marginTop: 16 }}><X size={14} /> Close</button>
    </div>
  );
}

function LoadingScreen() {
  return <div className="theme-dark" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}><span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>Loading...</span></div>;
}
function ErrorScreen() {
  return <div className="theme-dark" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}><p style={{ color: "var(--text-secondary)" }}>Assignment not found.</p></div>;
}

export default function AssignmentPage() {
  return <Suspense fallback={<LoadingScreen />}><AssignmentRouter /></Suspense>;
}
