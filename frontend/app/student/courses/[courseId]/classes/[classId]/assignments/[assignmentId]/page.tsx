"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { Send, Play, Upload, X, ChevronDown, ChevronUp, CheckCircle, Circle, ArrowRight } from "lucide-react";
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
  // Normalize questions so options can be string[] OR {id,text}[], and correct can be numeric OR correct_id letter.
  const questions = (assignment.questions || []).map((q: any) => {
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
                          <span style={{ fontSize: 14, color: correct ? "var(--success)" : wrong ? "var(--danger)" : "var(--text-primary)", flex: 1 }}>{optText}</span>
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
  const [showHints, setShowHints] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [solutionCode, setSolutionCode] = useState<string | null>(null);
  const [solutionLoading, setSolutionLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: "I can see your assignment and code. Ask me anything — I'll guide you without spoiling the solution." }]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleGetSolution = async () => {
    if (solutionCode !== null) { setShowSolution(!showSolution); return; }
    setSolutionLoading(true);
    try {
      const data = await fetchAPI(`/trainee/assignments/${assignmentId}/solution`);
      setSolutionCode(data.solution_code || "// No solution available");
      setShowSolution(true);
    } catch { setSolutionCode("// Failed to load solution"); setShowSolution(true); }
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
    setRunning(true); setRunOutput(null);
    try { const r = await fetchAPI("/trainee/run", { method: "POST", body: JSON.stringify({ code, language: langInfo.language }) }); setRunOutput({ stdout: r.stdout || "", stderr: r.stderr || "" }); }
    catch { setRunOutput({ stdout: "", stderr: "Failed to execute." }); }
    finally { setRunning(false); }
  };

  const handleSubmit = async () => {
    setSubmitting(true); setResult(null);
    try { const d = await fetchAPI("/trainee/submit", { method: "POST", body: JSON.stringify({ course_id: courseId, class_id: classId, assignment_id: assignmentId, code, assignment_type: "coding", language: langInfo.language }) }); setResult(d); }
    catch { alert("Grading failed."); }
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

  return (
    <div className="theme-dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <Breadcrumb assignment={assignment} courseId={courseId} classId={classId} dark />

      <div style={{ display: "flex", height: "calc(100vh - 44px)", overflow: "hidden" }}>
        {/* Left — Brief */}
        <div style={{ width: "25%", borderRight: "1px solid var(--border)", overflowY: "auto", padding: "24px 20px", background: "var(--bg-secondary)" }}>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>ASSIGNMENT</span>
          <h2 className="display-heading" style={{ fontSize: 18, marginBottom: 8 }}>{assignment.title}</h2>
          <div style={{ marginBottom: 16 }}><span className="badge badge-neutral">{assignment.difficulty}</span></div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>{assignment.description}</p>

          {assignment.test_cases?.length > 0 && (
            <>
              <span className="overline" style={{ display: "block", marginBottom: 10 }}>TEST CASES</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {assignment.test_cases.map((tc: any, i: number) => (
                  <div key={i} style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
                    <span style={{ color: "var(--text-tertiary)" }}>{tc.description || `Test ${i + 1}`}</span>
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 4 }}>Expected: <span style={{ color: "var(--success)" }}>{tc.expected_output}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}

          <button onClick={() => setShowHints(!showHints)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text-secondary)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", fontFamily: "var(--font-body)" }}>
            {showHints ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showHints ? "Hide" : "Show"} hints
          </button>
          {showHints && (
            <div style={{ marginTop: 12 }}>
              {assignment.hints?.length > 0 && <HintBox items={assignment.hints} label="Hints" color="var(--accent)" bg="var(--accent-subtle)" />}
              {assignment.pitfalls?.length > 0 && <HintBox items={assignment.pitfalls} label="Pitfalls" color="var(--danger)" bg="var(--danger-bg)" />}
              {assignment.aha_moment && <HintBox items={[assignment.aha_moment]} label="Aha Moment" color="var(--success)" bg="var(--success-bg)" />}
            </div>
          )}

          {assignment.rubric?.length > 0 && (
            <>
              <span className="overline" style={{ display: "block", marginTop: 20, marginBottom: 10 }}>RUBRIC</span>
              {assignment.rubric.map((r: any, i: number) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{r.criterion}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{r.weight}%</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Center — Editor */}
        <div style={{ width: "50%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)", padding: "8px 16px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>{langInfo.filename}</div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor height="100%" language={langInfo.monacoLang} theme="vs-dark" value={code} onChange={(v) => setCode(v || "")} options={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false, lineNumbers: "on", renderLineHighlight: "gutter" }} />
          </div>
          {runOutput && (
            <div style={{ background: "var(--bg-tertiary)", borderTop: "1px solid var(--border)", padding: "12px 16px", minHeight: 80, maxHeight: 200, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Output</span>
                <button onClick={() => setRunOutput(null)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}><X size={14} /></button>
              </div>
              {runOutput.stdout && <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)", whiteSpace: "pre-wrap" }}>{runOutput.stdout}</pre>}
              {runOutput.stderr && <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--danger)", whiteSpace: "pre-wrap" }}>{runOutput.stderr}</pre>}
              {!runOutput.stdout && !runOutput.stderr && <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "pre-wrap" }}>No output</pre>}
            </div>
          )}
          {/* Solution panel (hidden until requested) */}
          {showSolution && solutionCode && (
            <div style={{ background: "#1a2332", borderTop: "1px solid var(--border)", padding: "12px 16px", minHeight: 80, maxHeight: 200, overflowY: "auto", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase" }}>Solution</span>
                <button onClick={() => setShowSolution(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}><X size={14} /></button>
              </div>
              <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#a3e635", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{solutionCode}</pre>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
            <button className="btn-secondary" onClick={handleRun} disabled={running} style={{ flex: 1 }}><Play size={14} /> {running ? "Running..." : "Run Code"}</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ flex: 1 }}><Upload size={14} /> {submitting ? "Grading..." : "Submit"}</button>
            <button onClick={handleGetSolution} disabled={solutionLoading} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", cursor: "pointer", color: showSolution ? "var(--accent)" : "var(--text-tertiary)", fontSize: 12, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
              {solutionLoading ? "..." : showSolution ? "Hide Solution" : "Get Solution"}
            </button>
          </div>
        </div>

        {/* Right — AI Companion */}
        <div style={{ width: "25%", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
          {/* Problems section */}
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", overflowY: "auto", maxHeight: "40%", flexShrink: 0 }}>
            <span className="overline" style={{ display: "block", marginBottom: 10 }}>PROBLEMS</span>
            {assignment.test_cases?.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: assignment.pitfalls?.length ? 12 : 0 }}>
                {assignment.test_cases.map((tc: any, i: number) => (
                  <div key={i} style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                    <span style={{ color: "var(--text-secondary)" }}>{tc.description || `Test ${i + 1}`}</span>
                    {tc.input && <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", marginTop: 2, fontSize: 11 }}>Input: {tc.input}</div>}
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--success)", marginTop: 2, fontSize: 11 }}>Expected: {tc.expected_output}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", fontSize: 12 }}>
                <p style={{ color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>{assignment.description}</p>
                {assignment.rubric?.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", fontWeight: 600 }}>Grading Criteria</span>
                    {assignment.rubric.map((r: any, i: number) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", color: "var(--text-secondary)" }}>
                        <span>{r.criterion}</span>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>{r.weight}%</span>
                      </div>
                    ))}
                  </div>
                )}
                {!assignment.rubric?.length && (
                  <p style={{ color: "var(--text-tertiary)", fontSize: 11, fontStyle: "italic" }}>No test cases defined. Your code will be evaluated by AI.</p>
                )}
              </div>
            )}
            {assignment.pitfalls?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                {assignment.pitfalls.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "var(--danger)", padding: "4px 0" }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>!</span>
                    <span style={{ color: "var(--text-secondary)" }}>{p}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 16px 16px", minHeight: 0 }}>
            <span className="overline" style={{ marginBottom: 12 }}>AI COMPANION</span>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                <div style={{ maxWidth: "90%", padding: "8px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.5, ...(msg.role === "user" ? { background: "var(--bg-tertiary)", color: "var(--text-primary)" } : { color: "var(--text-secondary)" }) }}>{msg.content}</div>
              </div>
            ))}
            {chatLoading && <span className="animate-pulse-slow" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Thinking...</span>}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea className="input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }} placeholder="Ask your companion..." rows={2} style={{ resize: "none", flex: 1, fontSize: 13 }} />
            <button className="btn-primary" onClick={handleChat} disabled={chatLoading || !chatInput.trim()} style={{ padding: "8px 12px", borderRadius: 8 }}><Send size={14} /></button>
          </div>
          </div>
        </div>
      </div>

      {(submitting || result) && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {submitting && !result ? (
            <h2 className="display-heading animate-pulse-slow" style={{ fontSize: 28 }}>Evaluating...</h2>
          ) : result ? (
            <GradingOverlay result={result} onClose={() => setResult(null)} />
          ) : null}
        </div>
      )}
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

function HintBox({ items, label, color, bg }: { items: string[]; label: string; color: string; bg: string }) {
  return (
    <div style={{ borderLeft: `2px solid ${color}`, background: bg, padding: "8px 12px", borderRadius: "0 6px 6px 0", marginBottom: 8 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color, fontWeight: 700 }}>{label}</span>
      {items.map((h, i) => <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{h}</p>)}
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
