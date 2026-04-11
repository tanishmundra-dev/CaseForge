"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import { ArrowRight } from "lucide-react";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: string;
  week_count: number;
  class_count: number;
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/trainee/courses")
      .then(setCourses)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1">
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>
          LEARNING PLATFORM
        </span>
        <h1 className="display-heading" style={{ fontSize: 48, marginBottom: 16 }}>
          Build skills that
          <br />
          get you hired.
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 16,
            marginBottom: 48,
            maxWidth: 520,
            lineHeight: 1.6,
          }}
        >
          Hands-on courses with automated grading. Every assignment tested
          against real-world standards.
        </p>
      </div>

      {loading ? (
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 15 }}>
          Loading courses...
        </p>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 500 }}>
            No courses available yet.
          </p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 8 }}>Check back soon.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 20,
          }}
        >
          {courses.map((course, i) => (
            <Link
              key={course.id}
              href={`/trainee/courses/${course.id}`}
              className={`card animate-in animate-in-${i + 2}`}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                textDecoration: "none",
              }}
            >
              <div>
                <div style={{ marginBottom: 14 }}>
                  <span className="badge badge-accent">PUBLISHED</span>
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 20,
                    color: "var(--text-heading)",
                    marginBottom: 10,
                    lineHeight: 1.3,
                  }}
                >
                  {course.title}
                </h3>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  {course.description}
                </p>
              </div>
              <span
                style={{
                  color: "var(--accent)",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                View course <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
