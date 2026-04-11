"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { ArrowRight } from "lucide-react";

interface Assignment {
  id: string;
  title: string;
  difficulty: string;
}

interface ClassItem {
  id: string;
  number: number;
  title: string;
  description: string;
  assignments: Assignment[];
}

interface Week {
  id: string;
  number: number;
  title: string;
  classes: ClassItem[];
}

interface Course {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  weeks: Week[];
}

export default function WeeklyPlanPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI(`/trainee/courses/${courseId}`)
      .then(setCourse)
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div style={{ padding: "80px 48px", textAlign: "center" }}>
        <span className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 16 }}>
          Loading course...
        </span>
      </div>
    );
  }

  if (!course) return null;

  return (
    <div style={{ padding: "40px 48px 80px", maxWidth: 900, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb animate-in animate-in-1">
        <Link href="/trainee/courses">Courses</Link>
        <span className="separator">/</span>
        <span className="current">{course.title}</span>
      </div>

      {/* Header */}
      <div className="animate-in animate-in-1">
        <h1 className="display-heading" style={{ fontSize: 40, marginBottom: 16 }}>
          {course.title}
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 16,
            lineHeight: 1.6,
            maxWidth: 700,
            marginBottom: 48,
          }}
        >
          {course.description}
        </p>
      </div>

      {/* Weekly plan */}
      {course.weeks.map((week, wi) => (
        <div key={week.id} className={`animate-in animate-in-${wi + 2}`} style={{ marginBottom: 40 }}>
          {/* Week overline */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-tertiary)",
              display: "block",
              marginBottom: 16,
            }}
          >
            WEEK {week.number}
          </span>

          {/* Classes in this week */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {week.classes.map((cls) => (
              <Link
                key={cls.id}
                href={`/trainee/courses/${courseId}/classes/${cls.id}`}
                className="card"
                style={{
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                {/* Big gold number */}
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 36,
                    fontWeight: 700,
                    color: "var(--accent)",
                    opacity: 0.5,
                    minWidth: 48,
                    lineHeight: 1,
                  }}
                >
                  {cls.number}
                </span>

                {/* Title + description */}
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 17,
                      color: "var(--text-heading)",
                      marginBottom: 4,
                      lineHeight: 1.3,
                    }}
                  >
                    {cls.title}
                  </h3>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: 14,
                      lineHeight: 1.4,
                    }}
                  >
                    {cls.description}
                  </p>
                </div>

                {/* Arrow */}
                <ArrowRight size={18} color="var(--text-tertiary)" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
