"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: string;
  weeks: { id: string; classes: { id: string }[] }[];
}

export default function CourseManagementPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/instructor/courses")
      .then(setCourses)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <div>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>
            INSTRUCTOR PORTAL
          </span>
          <h1 className="display-heading" style={{ fontSize: 36 }}>
            All Courses
          </h1>
        </div>
        <Link
          href="/trainee/courses"
          style={{
            color: "var(--text-secondary)",
            fontSize: 14,
            fontWeight: 500,
            marginTop: 8,
          }}
        >
          &larr; Student View
        </Link>
      </div>

      {loading ? (
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 15 }}>
          Loading...
        </p>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 500 }}>
            No courses yet.
          </p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 8 }}>
            Create one in Mission Control.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {courses.map((course, i) => (
            <div
              key={course.id}
              className={`card animate-in animate-in-${i + 2}`}
              style={{
                padding: "20px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1 }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 17,
                    color: "var(--text-heading)",
                    marginBottom: 4,
                  }}
                >
                  {course.title}
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5 }}>
                  {course.description.slice(0, 140)}...
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 24 }}>
                <span
                  className={`badge ${course.status === "published" ? "badge-success" : "badge-accent"}`}
                >
                  {course.status.toUpperCase()}
                </span>
                <ArrowRight size={18} color="var(--text-tertiary)" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
