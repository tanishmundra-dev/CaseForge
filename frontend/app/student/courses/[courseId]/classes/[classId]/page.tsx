"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { ArrowRight, BookOpen, ChevronDown, ChevronUp } from "lucide-react";

/* Simple markdown to HTML renderer for theory content */
function renderMarkdown(md: string): string {
  return md
    // Code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre style="background:#1a1a18;color:#e8e4df;padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.5;font-family:var(--font-mono);margin:12px 0"><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;font-size:13px;font-family:var(--font-mono)">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4 style="font-family:var(--font-display);font-size:16px;font-weight:700;margin:20px 0 8px;color:var(--text-heading)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;margin:24px 0 10px;color:var(--text-heading)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="font-family:var(--font-display);font-size:22px;font-weight:700;margin:0 0 16px;color:var(--text-heading)">$1</h2>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:8px 0 8px 20px;list-style:disc">$1</ul>')
    // Paragraphs (double newlines)
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
    // Single newlines to <br> (within paragraphs)
    .replace(/\n/g, '<br/>')
    // Wrap in paragraph
    .replace(/^/, '<p style="margin:8px 0">')
    .replace(/$/, '</p>');
}

interface Assignment {
  id: string;
  title: string;
  description: string;
  difficulty: string;
}

interface ClassDetail {
  course_id: string;
  course_title: string;
  week_number: number;
  week_title: string;
  id: string;
  number: number;
  title: string;
  description: string;
  theory_content?: string;
  assignments: Assignment[];
}

export default function ClassDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [theoryExpanded, setTheoryExpanded] = useState(true);

  useEffect(() => {
    fetchAPI(`/trainee/courses/${courseId}/classes/${classId}`)
      .then(setCls)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, classId]);

  if (loading) {
    return (
      <div style={{ padding: "80px 48px", textAlign: "center" }}>
        <span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>
          Loading class...
        </span>
      </div>
    );
  }

  if (!cls) return null;

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
      <div className="animate-in animate-in-1">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-tertiary)",
            display: "block",
            marginBottom: 12,
          }}
        >
          WEEK {cls.week_number} &middot; CLASS {cls.number}
        </span>
        <h1 className="display-heading" style={{ fontSize: 36, marginBottom: 12 }}>
          {cls.title}
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 640,
            marginBottom: 40,
          }}
        >
          {cls.description}
        </p>
      </div>

      {/* Theory / Study Material */}
      {cls.theory_content && cls.theory_content.trim() && (
        <div className="animate-in animate-in-2" style={{ marginBottom: 32 }}>
          <div
            onClick={() => setTheoryExpanded(!theoryExpanded)}
            style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              marginBottom: theoryExpanded ? 16 : 0, userSelect: "none",
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: "var(--accent-subtle)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <BookOpen size={16} color="var(--accent)" />
            </div>
            <span className="overline" style={{ flex: 1 }}>STUDY MATERIAL</span>
            {theoryExpanded ? <ChevronUp size={16} color="var(--text-tertiary)" /> : <ChevronDown size={16} color="var(--text-tertiary)" />}
          </div>
          {theoryExpanded && (
            <div
              className="card"
              style={{
                padding: "28px 32px",
                fontSize: 15,
                lineHeight: 1.8,
                color: "var(--text-primary)",
              }}
            >
              <div
                className="theory-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(cls.theory_content) }}
              />
            </div>
          )}
        </div>
      )}

      {/* Assignments */}
      <div className="animate-in animate-in-2">
        <span className="overline" style={{ display: "block", marginBottom: 16 }}>
          ASSIGNMENTS
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cls.assignments.map((asn, i) => (
            <Link
              key={asn.id}
              href={`/student/courses/${courseId}/classes/${classId}/assignments/${asn.id}`}
              className="card"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              {/* Number */}
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--accent)",
                  opacity: 0.5,
                  minWidth: 36,
                  lineHeight: 1,
                }}
              >
                {i + 1}
              </span>

              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "var(--text-heading)",
                    marginBottom: 4,
                  }}
                >
                  {asn.title}
                </h3>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  {asn.description.slice(0, 120)}...
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="badge badge-neutral">{asn.difficulty}</span>
                <ArrowRight size={16} color="var(--text-tertiary)" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
