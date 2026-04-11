"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { Send, Play, Upload, X, ChevronDown, ChevronUp } from "lucide-react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TestCase {
  input: string;
  expected_output: string;
  description: string;
}

interface RubricItem {
  criterion: string;
  excellent: string;
  acceptable: string;
  poor: string;
  weight: number;
}

interface AssignmentDetail {
  course_id: string;
  course_title: string;
  week_number: number;
  class_id: string;
  class_number: number;
  class_title: string;
  id: string;
  title: string;
  description: string;
  difficulty: string;
  hints: string[];
  pitfalls: string[];
  aha_moment: string;
  starter_code: string;
  test_cases: TestCase[];
  rubric: RubricItem[];
}

interface CriterionScore {
  criterion: string;
  score: number;
  level: string;
  feedback: string;
}

interface GradingResult {
  overall_score: number;
  grade: string;
  criterion_scores: CriterionScore[];
  overall_feedback: string;
  strengths: string[];
  improvements: string[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function SandboxContent() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [showHints, setShowHints] = useState(false);

  // Companion chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "I can see your assignment and code. Ask me anything -- I'll guide you without spoiling the solution.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAPI(`/trainee/courses/${courseId}/classes/${classId}/assignments/${assignmentId}`)
      .then((data) => {
        setAssignment(data);
        setCode(data.starter_code || "# Write your solution here\n");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, classId, assignmentId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRun = async () => {
    setRunning(true);
    setRunOutput(null);
    try {
      const result = await fetchAPI("/trainee/run", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setRunOutput({ stdout: result.stdout || "", stderr: result.stderr || "" });
    } catch {
      setRunOutput({ stdout: "", stderr: "Failed to execute code." });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitting(true);
    setResult(null);
    try {
      const data = await fetchAPI("/trainee/submit", {
        method: "POST",
        body: JSON.stringify({
          course_id: courseId,
          class_id: classId,
          assignment_id: assignmentId,
          code,
          trainee_name: "Demo Trainee",
        }),
      });
      setResult(data);
    } catch {
      alert("Grading failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const data = await fetchAPI("/trainee/companion/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          assignment,
          current_code: code,
        }),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="theme-dark" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>
          Loading sandbox...
        </span>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="theme-dark" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Assignment not found.</p>
      </div>
    );
  }

  const scoreColor = (score: number) =>
    score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="theme-dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: "100vh" }}>
      {/* Top bar with breadcrumbs */}
      <div
        style={{
          height: 44,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 8,
          fontSize: 13,
          background: "var(--bg-secondary)",
        }}
      >
        <Link href="/trainee/courses" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          Courses
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>/</span>
        <Link href={`/trainee/courses/${courseId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {assignment.course_title}
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>/</span>
        <Link href={`/trainee/courses/${courseId}/classes/${classId}`} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
          {assignment.class_title}
        </Link>
        <span style={{ color: "var(--text-tertiary)" }}>/</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{assignment.title}</span>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 44px)", overflow: "hidden" }}>
        {/* Left -- Assignment Brief */}
        <div
          style={{
            width: "25%",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            padding: "24px 20px",
            background: "var(--bg-secondary)",
          }}
        >
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>
            ASSIGNMENT
          </span>
          <h2 className="display-heading" style={{ fontSize: 18, marginBottom: 8 }}>
            {assignment.title}
          </h2>
          <div style={{ marginBottom: 16 }}>
            <span className="badge badge-neutral">{assignment.difficulty}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 20 }}>
            {assignment.description}
          </p>

          {/* Test Cases */}
          {assignment.test_cases.length > 0 && (
            <>
              <span className="overline" style={{ display: "block", marginBottom: 10 }}>
                TEST CASES
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {assignment.test_cases.map((tc, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--text-tertiary)" }}>{tc.description || `Test ${i + 1}`}</span>
                    <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", marginTop: 4 }}>
                      Expected: <span style={{ color: "var(--success)" }}>{tc.expected_output}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Hints & Pitfalls toggle */}
          <button
            onClick={() => setShowHints(!showHints)}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 12px",
              color: "var(--text-secondary)",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              fontFamily: "var(--font-body)",
            }}
          >
            {showHints ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showHints ? "Hide hints & pitfalls" : "Show hints & pitfalls"}
          </button>

          {showHints && (
            <div style={{ marginTop: 12 }}>
              {assignment.hints.length > 0 && (
                <div
                  style={{
                    borderLeft: "2px solid var(--accent)",
                    background: "var(--accent-subtle)",
                    padding: "8px 12px",
                    borderRadius: "0 6px 6px 0",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", fontWeight: 700 }}>
                    Hints
                  </span>
                  {assignment.hints.map((h, i) => (
                    <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{h}</p>
                  ))}
                </div>
              )}
              {assignment.pitfalls.length > 0 && (
                <div
                  style={{
                    borderLeft: "2px solid var(--danger)",
                    background: "var(--danger-bg)",
                    padding: "8px 12px",
                    borderRadius: "0 6px 6px 0",
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--danger)", fontWeight: 700 }}>
                    Pitfalls
                  </span>
                  {assignment.pitfalls.map((p, i) => (
                    <p key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{p}</p>
                  ))}
                </div>
              )}
              {assignment.aha_moment && (
                <div
                  style={{
                    borderLeft: "2px solid var(--success)",
                    background: "var(--success-bg)",
                    padding: "8px 12px",
                    borderRadius: "0 6px 6px 0",
                  }}
                >
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--success)", fontWeight: 700 }}>
                    Aha Moment
                  </span>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>{assignment.aha_moment}</p>
                </div>
              )}
            </div>
          )}

          {/* Rubric */}
          {assignment.rubric.length > 0 && (
            <>
              <span className="overline" style={{ display: "block", marginTop: 20, marginBottom: 10 }}>
                RUBRIC
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {assignment.rubric.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      padding: "4px 0",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>{r.criterion}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                      {r.weight}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Center -- Code Editor + Output */}
        <div style={{ width: "50%", display: "flex", flexDirection: "column" }}>
          {/* File tab */}
          <div
            style={{
              background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border)",
              padding: "8px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            solution.py
          </div>

          {/* Editor */}
          <div style={{ flex: 1 }}>
            <Editor
              height="100%"
              language="python"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v || "")}
              options={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderLineHighlight: "gutter",
              }}
            />
          </div>

          {/* Output panel */}
          {runOutput && (
            <div
              style={{
                background: "var(--bg-tertiary)",
                borderTop: "1px solid var(--border)",
                padding: "12px 16px",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Output
                </span>
                <button
                  onClick={() => setRunOutput(null)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
                >
                  <X size={14} />
                </button>
              </div>
              {runOutput.stdout && (
                <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)", whiteSpace: "pre-wrap", marginBottom: 4 }}>
                  {runOutput.stdout}
                </pre>
              )}
              {runOutput.stderr && (
                <pre style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--danger)", whiteSpace: "pre-wrap" }}>
                  {runOutput.stderr}
                </pre>
              )}
              {!runOutput.stdout && !runOutput.stderr && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
                  No output.
                </span>
              )}
            </div>
          )}

          {/* Bottom bar */}
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-secondary)",
            }}
          >
            <button className="btn-secondary" onClick={handleRun} disabled={running} style={{ flex: 1 }}>
              <Play size={14} /> {running ? "Running..." : "Run Code"}
            </button>
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting} style={{ flex: 1 }}>
              <Upload size={14} /> {submitting ? "Grading..." : "Submit for Grading"}
            </button>
          </div>
        </div>

        {/* Right -- AI Companion */}
        <div
          style={{
            width: "25%",
            borderLeft: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            padding: "20px 16px 16px",
            background: "var(--bg-secondary)",
          }}
        >
          <span className="overline" style={{ marginBottom: 16 }}>AI COMPANION</span>

          <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    maxWidth: "90%",
                    padding: "8px 12px",
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.5,
                    ...(msg.role === "user"
                      ? { background: "var(--bg-tertiary)", color: "var(--text-primary)" }
                      : { color: "var(--text-secondary)" }),
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <span className="animate-pulse-slow" style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                Thinking...
              </span>
            )}
            <div ref={chatEndRef} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <textarea
              className="input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChat();
                }
              }}
              placeholder="Ask your companion..."
              rows={2}
              style={{ resize: "none", flex: 1, fontSize: 13 }}
            />
            <button
              className="btn-primary"
              onClick={handleChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{ padding: "8px 12px", borderRadius: 8 }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Grading Overlay */}
      {(submitting || result) && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {submitting && !result ? (
            <div style={{ textAlign: "center" }}>
              <h2 className="display-heading animate-pulse-slow" style={{ fontSize: 28 }}>
                Evaluating your submission...
              </h2>
            </div>
          ) : result ? (
            <div
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: "40px 44px",
                maxWidth: 560,
                width: "90%",
                maxHeight: "85vh",
                overflowY: "auto",
                animation: "fadeInUp 0.4s ease forwards",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 28 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 64,
                    fontWeight: 700,
                    color: "var(--accent)",
                    lineHeight: 1,
                  }}
                >
                  {result.overall_score}
                </span>
                <span
                  className={`badge ${result.overall_score >= 80 ? "badge-success" : result.overall_score >= 60 ? "badge-warning" : "badge-danger"}`}
                  style={{ marginLeft: 12, verticalAlign: "super" }}
                >
                  {result.grade}
                </span>
              </div>

              <div style={{ height: 1, background: "var(--border)", marginBottom: 24 }} />

              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
                {result.overall_feedback}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
                {result.criterion_scores.map((cs, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>{cs.criterion}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: scoreColor(cs.score) }}>{cs.score}%</span>
                        <span className={`badge ${cs.level === "Excellent" ? "badge-success" : cs.level === "Acceptable" ? "badge-warning" : "badge-danger"}`}>
                          {cs.level}
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ height: "100%", width: `${cs.score}%`, background: scoreColor(cs.score), borderRadius: 2, transition: "width 0.6s ease" }} />
                    </div>
                    <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{cs.feedback}</p>
                  </div>
                ))}
              </div>

              {result.strengths.length > 0 && (
                <div style={{ borderLeft: "3px solid var(--success)", background: "var(--success-bg)", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--success)", fontWeight: 700 }}>Strengths</span>
                  {result.strengths.map((s, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{s}</p>
                  ))}
                </div>
              )}

              {result.improvements.length > 0 && (
                <div style={{ borderLeft: "3px solid var(--warning)", background: "var(--warning-bg)", padding: "12px 16px", borderRadius: "0 8px 8px 0", marginBottom: 24 }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--warning)", fontWeight: 700 }}>Improvements</span>
                  {result.improvements.map((s, i) => (
                    <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{s}</p>
                  ))}
                </div>
              )}

              <button className="btn-secondary" onClick={() => setResult(null)} style={{ width: "100%" }}>
                <X size={14} /> Close
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AssignmentPage() {
  return (
    <Suspense
      fallback={
        <div className="theme-dark" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#111110" }}>
          <span className="animate-pulse-slow" style={{ color: "#6B6660", fontSize: 16 }}>
            Loading sandbox...
          </span>
        </div>
      }
    >
      <SandboxContent />
    </Suspense>
  );
}
