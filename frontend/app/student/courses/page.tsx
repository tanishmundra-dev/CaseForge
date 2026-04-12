"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";
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

export default function StudentCoursesPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI("/trainee/courses")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ marginBottom: 40 }}>
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>MY COURSES</span>
        <h1 className="display-heading" style={{ fontSize: 36 }}>Build skills that get you hired</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, marginTop: 8 }}>Your enrolled courses and learning paths</p>
      </div>

      {loading ? (
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading courses...</p>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>No courses available yet.</p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 8 }}>Your instructor will enroll you in courses.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {courses.map((course, i) => (
            <Link
              key={course.id}
              href={`/student/courses/${course.id}`}
              className={`card animate-in animate-in-${Math.min(i + 2, 6)}`}
              style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <span className="badge badge-success" style={{ fontSize: 10 }}>PUBLISHED</span>
                <span className="badge badge-neutral" style={{ fontSize: 10 }}>{course.difficulty}</span>
              </div>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-heading)" }}>{course.title}</h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, flex: 1 }}>{course.description?.slice(0, 120)}{course.description?.length > 120 ? "..." : ""}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {course.week_count} weeks &middot; {course.class_count} classes
                </span>
                <ArrowRight size={16} color="var(--accent)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
