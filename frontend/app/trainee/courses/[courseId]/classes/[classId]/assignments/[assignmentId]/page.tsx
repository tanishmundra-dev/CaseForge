"use client";
import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  Send,
  Play,
  Upload,
  ArrowLeft,
  Lightbulb,
  Lock,
  Sparkles,
  Terminal,
  ListChecks,
  Check,
  X as XIcon,
  ChevronDown,
  ChevronUp,
  FileCode,
  BookOpen,
} from "lucide-react";
import dynamic from "next/dynamic";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────
interface TestCase {
  input: string;
  expected_output: string;
  description: string;
  is_hidden?: boolean;
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
  solution_code?: string;
  function_name?: string;
  language?: string;
  test_cases: TestCase[];
}

interface TestResult {
  test: number;
  description: string;
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
}

interface RunTestsResponse {
  test_results: TestResult[];
  passed: number;
  total: number;
  all_passed: boolean;
  stdout?: string;
  stderr?: string;
  time?: string;
  memory?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type LeftTab = "description" | "hints" | "companion";
type BottomTab = "tests" | "console";

// ─── Helpers ───────────────────────────────────────────────────────
function detectLanguage(assignment: AssignmentDetail | null): {
  key: string;
  monaco: string;
  filename: string;
} {
  const raw = (assignment?.language || "").toLowerCase();
  const starter = assignment?.starter_code || "";

  // Explicit language from backend wins
  if (raw) {
    if (["js", "javascript", "node", "nodejs"].includes(raw))
      return { key: "javascript", monaco: "javascript", filename: "solution.js" };
    if (["ts", "typescript"].includes(raw))
      return { key: "typescript", monaco: "typescript", filename: "solution.ts" };
    if (["py", "python", "python3"].includes(raw))
      return { key: "python", monaco: "python", filename: "solution.py" };
    if (raw === "java") return { key: "java", monaco: "java", filename: "Solution.java" };
    if (raw === "cpp" || raw === "c++")
      return { key: "cpp", monaco: "cpp", filename: "solution.cpp" };
    if (raw === "c") return { key: "c", monaco: "c", filename: "solution.c" };
    if (raw === "go") return { key: "go", monaco: "go", filename: "solution.go" };
    if (raw === "rust") return { key: "rust", monaco: "rust", filename: "solution.rs" };
  }

  // Heuristic fallback from starter_code
  if (/^\s*(function |const |let |var |console\.log|=>)/m.test(starter))
    return { key: "javascript", monaco: "javascript", filename: "solution.js" };
  return { key: "python", monaco: "python", filename: "solution.py" };
}

function difficultyBadgeClass(difficulty: string): string {
  const d = (difficulty || "").toLowerCase();
  if (d.includes("easy") || d.includes("beginner")) return "badge badge-success";
  if (d.includes("hard") || d.includes("advanced")) return "badge badge-danger";
  return "badge badge-warning";
}

// ─── Main component ────────────────────────────────────────────────
function SandboxContent() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const assignmentId = params.assignmentId as string;

  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  const [leftTab, setLeftTab] = useState<LeftTab>("description");
  const [bottomTab, setBottomTab] = useState<BottomTab>("tests");
  const [bottomOpen, setBottomOpen] = useState(true);

  // Run / Submit state
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<{
    stdout: string;
    stderr: string;
    status?: string;
  } | null>(null);
  const [testResult, setTestResult] = useState<RunTestsResponse | null>(null);

  // Hints reveal-one-at-a-time
  const [hintsRevealed, setHintsRevealed] = useState(0);

  // Companion chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "I can see your assignment and code. Ask me anything — I'll guide you without spoiling the solution.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAPI(
      `/trainee/courses/${courseId}/classes/${classId}/assignments/${assignmentId}`
    )
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

  const langInfo = useMemo(() => detectLanguage(assignment), [assignment]);

  // ─── Actions ─────────────────────────────────────────────────────
  const handleRun = async () => {
    setRunning(true);
    setConsoleOutput(null);
    setBottomTab("console");
    setBottomOpen(true);
    try {
      const result = await fetchAPI("/run-code", {
        method: "POST",
        body: JSON.stringify({ code, language: langInfo.key }),
      });
      setConsoleOutput({
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        status: result.status,
      });
    } catch (err) {
      setConsoleOutput({
        stdout: "",
        stderr:
          err instanceof Error
            ? err.message
            : "Failed to execute code. Is the Judge0 service running?",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitting(true);
    setTestResult(null);
    setBottomTab("tests");
    setBottomOpen(true);
    try {
      const data: RunTestsResponse = await fetchAPI("/run-tests", {
        method: "POST",
        body: JSON.stringify({
          code,
          language: langInfo.key,
          test_cases: assignment.test_cases || [],
          function_name: assignment.function_name,
        }),
      });
      setTestResult(data);
    } catch (err) {
      setTestResult({
        test_results: [],
        passed: 0,
        total: assignment.test_cases?.length || 0,
        all_passed: false,
        stderr:
          err instanceof Error
            ? err.message
            : "Submission failed. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGetSolution = () => {
    if (!assignment?.solution_code) return;
    if (
      confirm(
        "Load the reference solution into the editor? This will replace your current code."
      )
    ) {
      setCode(assignment.solution_code);
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
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          assignment,
          current_code: code,
        }),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // ─── Render guards ───────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="theme-dark"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg-primary)",
        }}
      >
        <span
          className="animate-pulse-slow"
          style={{ color: "var(--text-tertiary)", fontSize: 16 }}
        >
          Loading sandbox...
        </span>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div
        className="theme-dark"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "var(--bg-primary)",
        }}
      >
        <p style={{ color: "var(--text-secondary)" }}>Assignment not found.</p>
      </div>
    );
  }

  const hints = assignment.hints || [];
  const pitfalls = assignment.pitfalls || [];
  const testCases = assignment.test_cases || [];

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div
      className="theme-dark"
      style={{
        background: "var(--bg-primary)",
        color: "var(--text-primary)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── TOP BAR ─────────────────────────────────────────────── */}
      <TopBar
        assignment={assignment}
        courseId={courseId}
        classId={classId}
        onRun={handleRun}
        onSubmit={handleSubmit}
        running={running}
        submitting={submitting}
      />

      {/* ── MAIN SPLIT ─────────────────────────────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT PANEL — 40% */}
        <div
          style={{
            width: "40%",
            borderRight: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            minWidth: 360,
          }}
        >
          <TabBar
            tabs={[
              { id: "description", label: "Description", icon: <BookOpen size={14} /> },
              { id: "hints", label: "Hints", icon: <Lightbulb size={14} /> },
              { id: "companion", label: "AI Companion", icon: <Sparkles size={14} /> },
            ]}
            active={leftTab}
            onChange={(id) => setLeftTab(id as LeftTab)}
          />

          <div style={{ flex: 1, overflowY: "auto" }}>
            {leftTab === "description" && (
              <DescriptionTab assignment={assignment} testCases={testCases} />
            )}
            {leftTab === "hints" && (
              <HintsTab
                hints={hints}
                pitfalls={pitfalls}
                ahaMoment={assignment.aha_moment}
                revealed={hintsRevealed}
                onReveal={() => setHintsRevealed((r) => Math.min(r + 1, hints.length))}
                onGetSolution={
                  assignment.solution_code ? handleGetSolution : undefined
                }
              />
            )}
            {leftTab === "companion" && (
              <CompanionTab
                messages={messages}
                chatInput={chatInput}
                chatLoading={chatLoading}
                onInputChange={setChatInput}
                onSend={handleChat}
                chatEndRef={chatEndRef}
              />
            )}
          </div>
        </div>

        {/* RIGHT PANEL — 60% */}
        <div
          style={{
            width: "60%",
            display: "flex",
            flexDirection: "column",
            minWidth: 480,
          }}
        >
          {/* File tab */}
          <div
            style={{
              background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border)",
              padding: "8px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <FileCode size={13} />
            {langInfo.filename}
          </div>

          {/* Editor */}
          <div style={{ flex: bottomOpen ? 0.65 : 1, minHeight: 0 }}>
            <Editor
              height="100%"
              language={langInfo.monaco}
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

          {/* Bottom panel: Test Results / Console */}
          <BottomPanel
            open={bottomOpen}
            tab={bottomTab}
            onTabChange={setBottomTab}
            onToggleOpen={() => setBottomOpen((o) => !o)}
            consoleOutput={consoleOutput}
            testResult={testResult}
            running={running}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Top bar ───────────────────────────────────────────────────────
function TopBar({
  assignment,
  courseId,
  classId,
  onRun,
  onSubmit,
  running,
  submitting,
}: {
  assignment: AssignmentDetail;
  courseId: string;
  classId: string;
  onRun: () => void;
  onSubmit: () => void;
  running: boolean;
  submitting: boolean;
}) {
  return (
    <div
      style={{
        height: 56,
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      {/* Left: back + title + badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <Link
          href={`/trainee/courses/${courseId}/classes/${classId}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 8,
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            transition: "all 0.2s ease",
            flexShrink: 0,
          }}
          aria-label="Back to class"
        >
          <ArrowLeft size={16} />
        </Link>
        <div style={{ minWidth: 0 }}>
          <h1
            className="display-heading"
            style={{
              fontSize: 16,
              margin: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {assignment.title}
          </h1>
          <div
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginTop: 2,
            }}
          >
            {assignment.course_title} · {assignment.class_title}
          </div>
        </div>
        <span className={difficultyBadgeClass(assignment.difficulty)}>
          {assignment.difficulty}
        </span>
      </div>

      {/* Right: Run / Submit */}
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          className="btn-secondary"
          onClick={onRun}
          disabled={running || submitting}
        >
          <Play size={14} /> {running ? "Running..." : "Run Code"}
        </button>
        <button
          className="btn-primary"
          onClick={onSubmit}
          disabled={running || submitting}
        >
          <Upload size={14} /> {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </div>
  );
}

// ─── Tab bar (reusable) ────────────────────────────────────────────
function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              background: "transparent",
              border: "none",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              cursor: "pointer",
              transition: "color 0.2s ease, border-color 0.2s ease",
              marginBottom: -1,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Description tab ───────────────────────────────────────────────
function DescriptionTab({
  assignment,
  testCases,
}: {
  assignment: AssignmentDetail;
  testCases: TestCase[];
}) {
  const visibleCases = testCases.filter((tc) => !tc.is_hidden);
  return (
    <div style={{ padding: "24px 22px" }}>
      <h2
        className="display-heading"
        style={{ fontSize: 22, marginBottom: 10 }}
      >
        {assignment.title}
      </h2>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <span className={difficultyBadgeClass(assignment.difficulty)}>
          {assignment.difficulty}
        </span>
        {assignment.week_number != null && (
          <span className="badge badge-neutral">Week {assignment.week_number}</span>
        )}
      </div>

      <p
        style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          marginBottom: 24,
          whiteSpace: "pre-wrap",
        }}
      >
        {assignment.description}
      </p>

      {visibleCases.length > 0 && (
        <>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>
            Examples
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {visibleCases.map((tc, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: 600,
                    marginBottom: 8,
                  }}
                >
                  Example {i + 1}
                  {tc.description ? ` — ${tc.description}` : ""}
                </div>
                {tc.input !== "" && tc.input != null && (
                  <ExampleRow label="Input" value={String(tc.input)} />
                )}
                <ExampleRow
                  label="Output"
                  value={String(tc.expected_output)}
                  color="var(--success)"
                />
              </div>
            ))}
          </div>
        </>
      )}

      {assignment.pitfalls?.length > 0 && (
        <div
          style={{
            borderLeft: "3px solid var(--danger)",
            background: "var(--danger-bg)",
            padding: "12px 14px",
            borderRadius: "0 8px 8px 0",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--danger)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Pitfalls
          </div>
          {assignment.pitfalls.map((p, i) => (
            <p
              key={i}
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                marginTop: i === 0 ? 0 : 4,
              }}
            >
              {p}
            </p>
          ))}
        </div>
      )}

      {assignment.aha_moment && (
        <div
          style={{
            borderLeft: "3px solid var(--success)",
            background: "var(--success-bg)",
            padding: "12px 14px",
            borderRadius: "0 8px 8px 0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--success)",
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Key Insight
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {assignment.aha_moment}
          </p>
        </div>
      )}
    </div>
  );
}

function ExampleRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          marginRight: 8,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}:
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: color || "var(--text-primary)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Hints tab ─────────────────────────────────────────────────────
function HintsTab({
  hints,
  pitfalls,
  ahaMoment,
  revealed,
  onReveal,
  onGetSolution,
}: {
  hints: string[];
  pitfalls: string[];
  ahaMoment: string;
  revealed: number;
  onReveal: () => void;
  onGetSolution?: () => void;
}) {
  return (
    <div style={{ padding: "24px 22px" }}>
      <span className="overline" style={{ display: "block", marginBottom: 14 }}>
        Hints
      </span>

      {hints.length === 0 && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
            marginBottom: 24,
          }}
        >
          No hints available for this assignment.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {hints.map((h, i) => {
          const isRevealed = i < revealed;
          return (
            <div
              key={i}
              style={{
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${isRevealed ? "var(--accent)" : "var(--border)"}`,
                background: isRevealed ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                padding: "12px 14px",
                borderRadius: "0 10px 10px 0",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: isRevealed ? 8 : 0,
                }}
              >
                {isRevealed ? (
                  <Lightbulb size={14} color="var(--accent)" />
                ) : (
                  <Lock size={14} color="var(--text-tertiary)" />
                )}
                <span
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                    color: isRevealed ? "var(--accent)" : "var(--text-tertiary)",
                  }}
                >
                  Hint {i + 1}
                </span>
              </div>
              {isRevealed && (
                <p
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  {h}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {revealed < hints.length && (
        <button
          className="btn-secondary"
          onClick={onReveal}
          style={{ width: "100%", marginBottom: 20 }}
        >
          <Lightbulb size={14} />
          Reveal hint {revealed + 1} of {hints.length}
        </button>
      )}

      {pitfalls.length > 0 && (
        <>
          <span className="overline" style={{ display: "block", marginTop: 8, marginBottom: 10 }}>
            Common Pitfalls
          </span>
          <div
            style={{
              borderLeft: "3px solid var(--danger)",
              background: "var(--danger-bg)",
              padding: "12px 14px",
              borderRadius: "0 8px 8px 0",
              marginBottom: 20,
            }}
          >
            {pitfalls.map((p, i) => (
              <p
                key={i}
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  marginTop: i === 0 ? 0 : 6,
                }}
              >
                · {p}
              </p>
            ))}
          </div>
        </>
      )}

      {ahaMoment && (
        <>
          <span className="overline" style={{ display: "block", marginBottom: 10 }}>
            Key Insight
          </span>
          <div
            style={{
              borderLeft: "3px solid var(--success)",
              background: "var(--success-bg)",
              padding: "12px 14px",
              borderRadius: "0 8px 8px 0",
              marginBottom: 20,
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}
            >
              {ahaMoment}
            </p>
          </div>
        </>
      )}

      {onGetSolution && (
        <button
          className="btn-secondary"
          onClick={onGetSolution}
          style={{ width: "100%" }}
        >
          <FileCode size={14} />
          Load reference solution
        </button>
      )}
    </div>
  );
}

// ─── Companion tab ─────────────────────────────────────────────────
function CompanionTab({
  messages,
  chatInput,
  chatLoading,
  onInputChange,
  onSend,
  chatEndRef,
}: {
  messages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: "88%",
                padding: "10px 14px",
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                ...(msg.role === "user"
                  ? {
                      background: "var(--accent)",
                      color: "#FFFFFF",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      borderBottomLeftRadius: 4,
                    }),
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {chatLoading && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              marginBottom: 12,
            }}
          >
            <div
              className="animate-pulse-slow"
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                borderBottomLeftRadius: 4,
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--text-tertiary)",
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          padding: "12px 14px",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
          flexShrink: 0,
        }}
      >
        <textarea
          className="input"
          value={chatInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Ask your companion..."
          rows={2}
          style={{ resize: "none", flex: 1, fontSize: 13 }}
        />
        <button
          className="btn-primary"
          onClick={onSend}
          disabled={chatLoading || !chatInput.trim()}
          style={{ padding: "10px 14px" }}
          aria-label="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Bottom panel ──────────────────────────────────────────────────
function BottomPanel({
  open,
  tab,
  onTabChange,
  onToggleOpen,
  consoleOutput,
  testResult,
  running,
  submitting,
}: {
  open: boolean;
  tab: BottomTab;
  onTabChange: (t: BottomTab) => void;
  onToggleOpen: () => void;
  consoleOutput: { stdout: string; stderr: string; status?: string } | null;
  testResult: RunTestsResponse | null;
  running: boolean;
  submitting: boolean;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        flex: open ? 0.35 : "0 0 auto",
        minHeight: open ? 160 : "auto",
      }}
    >
      {/* Header tabs + collapse */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: open ? "1px solid var(--border)" : "none",
          background: "var(--bg-secondary)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex" }}>
          <BottomTabBtn
            active={tab === "tests"}
            onClick={() => onTabChange("tests")}
            icon={<ListChecks size={13} />}
            label="Test Results"
            badge={
              testResult
                ? `${testResult.passed}/${testResult.total}`
                : undefined
            }
            badgeColor={
              testResult?.all_passed ? "var(--success)" : "var(--text-tertiary)"
            }
          />
          <BottomTabBtn
            active={tab === "console"}
            onClick={() => onTabChange("console")}
            icon={<Terminal size={13} />}
            label="Console"
          />
        </div>
        <button
          onClick={onToggleOpen}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: "0 16px",
            height: 38,
            display: "flex",
            alignItems: "center",
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {/* Body */}
      {open && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "console" && (
            <ConsoleView output={consoleOutput} running={running} />
          )}
          {tab === "tests" && (
            <TestResultsView result={testResult} submitting={submitting} />
          )}
        </div>
      )}
    </div>
  );
}

function BottomTabBtn({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-body)",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--accent)" : "var(--text-secondary)",
        borderBottom: `2px solid ${active ? "var(--accent)" : "transparent"}`,
        cursor: "pointer",
        transition: "color 0.2s ease, border-color 0.2s ease",
        marginBottom: -1,
      }}
    >
      {icon}
      {label}
      {badge && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: badgeColor || "var(--text-tertiary)",
            marginLeft: 4,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Console view ──────────────────────────────────────────────────
function ConsoleView({
  output,
  running,
}: {
  output: { stdout: string; stderr: string; status?: string } | null;
  running: boolean;
}) {
  if (running) {
    return (
      <div style={{ padding: "16px 18px" }}>
        <span
          className="animate-pulse-slow"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-tertiary)",
          }}
        >
          Running...
        </span>
      </div>
    );
  }

  if (!output) {
    return (
      <div style={{ padding: "16px 18px" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-tertiary)",
          }}
        >
          Click <strong style={{ color: "var(--text-secondary)" }}>Run Code</strong> to see output.
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 18px" }}>
      {output.status && (
        <div
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-tertiary)",
            marginBottom: 8,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Status: {output.status}
        </div>
      )}
      {output.stdout && (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--success)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            marginBottom: output.stderr ? 10 : 0,
          }}
        >
          {output.stdout}
        </pre>
      )}
      {output.stderr && (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--danger)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {output.stderr}
        </pre>
      )}
      {!output.stdout && !output.stderr && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-tertiary)",
          }}
        >
          (no output)
        </span>
      )}
    </div>
  );
}

// ─── Test results view ────────────────────────────────────────────
function TestResultsView({
  result,
  submitting,
}: {
  result: RunTestsResponse | null;
  submitting: boolean;
}) {
  if (submitting) {
    return (
      <div style={{ padding: "20px 18px" }}>
        <span
          className="animate-pulse-slow"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          Evaluating submission...
        </span>
      </div>
    );
  }

  if (!result) {
    return (
      <div style={{ padding: "20px 18px" }}>
        <span
          style={{
            fontSize: 13,
            color: "var(--text-tertiary)",
          }}
        >
          Click <strong style={{ color: "var(--text-secondary)" }}>Submit</strong> to run your code against the test cases.
        </span>
      </div>
    );
  }

  const accepted = result.all_passed && result.total > 0;

  return (
    <div style={{ padding: "16px 18px" }}>
      {/* Summary banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderRadius: 10,
          background: accepted ? "var(--success-bg)" : "var(--danger-bg)",
          border: `1px solid ${accepted ? "var(--success)" : "var(--danger)"}`,
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {accepted ? (
            <Check size={18} color="var(--success)" />
          ) : (
            <XIcon size={18} color="var(--danger)" />
          )}
          <div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 16,
                fontWeight: 700,
                color: accepted ? "var(--success)" : "var(--danger)",
              }}
            >
              {accepted ? "Accepted" : result.total === 0 ? "No test cases" : "Wrong Answer"}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              {result.passed} / {result.total} test cases passed
            </div>
          </div>
        </div>
        {(result.time || result.memory) && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-tertiary)",
              textAlign: "right",
            }}
          >
            {result.time && <div>{result.time}s</div>}
            {result.memory && <div>{Math.round(result.memory / 1024)} MB</div>}
          </div>
        )}
      </div>

      {/* Stderr from test runner (compilation/runtime crash) */}
      {result.stderr && result.test_results.length === 0 && (
        <pre
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--danger)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            padding: "10px 12px",
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          {result.stderr}
        </pre>
      )}

      {/* Test case cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {result.test_results.map((tc) => (
          <TestCaseCard key={tc.test} tc={tc} />
        ))}
      </div>
    </div>
  );
}

function TestCaseCard({ tc }: { tc: TestResult }) {
  const [expanded, setExpanded] = useState(!tc.passed);
  const accent = tc.passed ? "var(--success)" : "var(--danger)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "0 10px 10px 0",
        background: "var(--bg-tertiary)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          cursor: "pointer",
          fontFamily: "var(--font-body)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {tc.passed ? (
            <Check size={15} color="var(--success)" />
          ) : (
            <XIcon size={15} color="var(--danger)" />
          )}
          <span
            style={{
              fontSize: 13,
              color: "var(--text-primary)",
              fontWeight: 500,
            }}
          >
            Test {tc.test}
            {tc.description && tc.description !== `Test ${tc.test}` ? (
              <span style={{ color: "var(--text-tertiary)", marginLeft: 6 }}>
                — {tc.description}
              </span>
            ) : null}
          </span>
        </div>
        {expanded ? (
          <ChevronUp size={14} color="var(--text-tertiary)" />
        ) : (
          <ChevronDown size={14} color="var(--text-tertiary)" />
        )}
      </button>

      {expanded && (
        <div
          style={{
            padding: "0 14px 12px 14px",
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
          }}
        >
          <DetailRow label="Input" value={String(tc.input)} />
          <DetailRow
            label="Expected"
            value={String(tc.expected)}
            color="var(--success)"
          />
          <DetailRow
            label="Got"
            value={String(tc.actual)}
            color={tc.passed ? "var(--success)" : "var(--danger)"}
          />
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ marginTop: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          marginRight: 8,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}:
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: color || "var(--text-primary)",
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Default export with Suspense ──────────────────────────────────
export default function AssignmentPage() {
  return (
    <Suspense
      fallback={
        <div
          className="theme-dark"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "var(--bg-primary)",
          }}
        >
          <span
            className="animate-pulse-slow"
            style={{ color: "var(--text-tertiary)", fontSize: 16 }}
          >
            Loading sandbox...
          </span>
        </div>
      }
    >
      <SandboxContent />
    </Suspense>
  );
}
