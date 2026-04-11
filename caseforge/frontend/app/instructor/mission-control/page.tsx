"use client";
import { useState, useRef, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { Send, ChevronDown, ChevronUp } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface GeneratedCourse {
  title: string;
  description: string;
  difficulty: string;
  status: string;
  weeks: any[];
}

export default function MissionControlPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Describe the course you want to create. I'll generate a complete course structure with weeks, classes, and assignments.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<GeneratedCourse | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const data = await fetchAPI("/instructor/mission-control/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: userMsg.content }),
      });
      setCourse(data);
      setPublished(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I've generated your course. Review it on the right. When you're happy, hit Publish to make it available for trainees.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again with more detail." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!course) return;
    setPublishing(true);
    try {
      await fetchAPI("/instructor/courses", {
        method: "POST",
        body: JSON.stringify({ ...course, status: "published" }),
      });
      setPublished(true);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Course published! It's now visible to trainees." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to publish. Please try again." },
      ]);
    } finally {
      setPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!course) return;
    try {
      await fetchAPI("/instructor/courses", {
        method: "POST",
        body: JSON.stringify({ ...course, status: "draft" }),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Course saved as draft." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to save. Please try again." },
      ]);
    }
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* Left -- Chat Panel */}
      <div
        style={{
          width: "40%",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "36px 32px 20px",
          background: "var(--bg-secondary)",
        }}
      >
        <span className="overline" style={{ marginBottom: 10 }}>
          MISSION CONTROL
        </span>
        <h1 className="display-heading" style={{ fontSize: 32, marginBottom: 28 }}>
          What shall we build?
        </h1>

        <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  maxWidth: "85%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                  ...(msg.role === "user"
                    ? { background: "var(--bg-tertiary)", color: "var(--text-primary)" }
                    : { color: "var(--text-secondary)" }),
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <span className="animate-pulse-slow" style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
              Thinking...
            </span>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe a course..."
            rows={2}
            style={{ resize: "none", flex: 1 }}
          />
          <button
            className="btn-primary"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{ padding: "12px 16px", borderRadius: 10 }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Right -- Course Preview */}
      <div style={{ width: "60%", overflowY: "auto", padding: "36px 40px" }}>
        {!course ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 12,
            }}
          >
            <p style={{ color: "var(--text-tertiary)", fontSize: 16, textAlign: "center" }}>
              Your course will appear here.
              <br />
              Start a conversation with Mission Control.
            </p>
          </div>
        ) : (
          <div className="animate-in" style={{ maxWidth: 720 }}>
            {/* Title */}
            <h2 className="display-heading" style={{ fontSize: 28, marginBottom: 12 }}>
              {course.title}
            </h2>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <span className="badge badge-accent">
                {course.status === "published" ? "PUBLISHED" : "DRAFT"}
              </span>
              <span className="badge badge-neutral">{course.difficulty}</span>
            </div>

            <p style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
              {course.description}
            </p>

            {/* Weeks preview */}
            {course.weeks.map((week: any) => (
              <div key={week.id} style={{ marginBottom: 28 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--text-tertiary)",
                    display: "block",
                    marginBottom: 12,
                  }}
                >
                  WEEK {week.number} &mdash; {week.title}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {week.classes.map((cls: any) => (
                    <div
                      key={cls.id}
                      className="card"
                      style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: 24,
                          fontWeight: 700,
                          color: "var(--accent)",
                          opacity: 0.5,
                          minWidth: 32,
                        }}
                      >
                        {cls.number}
                      </span>
                      <div>
                        <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                          {cls.title}
                        </h4>
                        <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {cls.description}
                        </p>
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          {cls.assignments?.length || 0} assignment{(cls.assignments?.length || 0) !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                className="btn-secondary"
                onClick={handleSaveDraft}
                style={{ flex: 1 }}
              >
                Save as Draft
              </button>
              <button
                className="btn-primary"
                onClick={handlePublish}
                disabled={publishing || published}
                style={{ flex: 1 }}
              >
                {published ? "Published" : publishing ? "Publishing..." : "Publish Course"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
