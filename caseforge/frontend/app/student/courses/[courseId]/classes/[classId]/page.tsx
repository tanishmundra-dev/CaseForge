"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { ArrowRight } from "lucide-react";

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
  assignments: Assignment[];
}

export default function ClassDetailPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const classId = params.classId as string;
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

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
