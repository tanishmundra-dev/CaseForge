"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { ArrowRight, Plus, Upload, Pencil } from "lucide-react";
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
  const [publishing, setPublishing] = useState<string | null>(null);

  const loadCourses = () => {
    fetchAPI("/instructor/courses")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handlePublish = async (courseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPublishing(courseId);
    try {
      await fetchAPI(`/instructor/courses/${courseId}/publish`, { method: "POST" });
      loadCourses();
    } catch {
      // silent
    } finally {
      setPublishing(null);
    }
  };

  const weekCount = (course: CourseSummary) => course.weeks?.length || 0;
  const classCount = (course: CourseSummary) =>
    (course.weeks || []).reduce((sum, w) => sum + (w.classes?.length || 0), 0);

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div
        className="animate-in animate-in-1"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 40,
        }}
      >
        <div>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>
            INSTRUCTOR PORTAL
          </span>
          <h1 className="display-heading" style={{ fontSize: 36 }}>
            All Courses
          </h1>
        </div>
        <Link href="/instructor/mission-control?new=true" className="btn-primary" style={{ fontSize: 13, padding: "8px 16px" }}>
          <Plus size={16} />
          Create Course
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
            Head to{" "}
            <Link href="/instructor/mission-control?new=true" style={{ color: "var(--accent)" }}>
              Mission Control
            </Link>{" "}
            to create one.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {courses.map((course, i) => (
            <Link
              key={course.id}
              href={`/instructor/courses/${course.id}`}
              className={`card animate-in animate-in-${Math.min(i + 2, 6)}`}
              style={{
                padding: "20px 28px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      fontSize: 17,
                      color: "var(--text-heading)",
                    }}
                  >
                    {course.title}
                  </h3>
                  <span
                    className={`badge ${course.status === "published" ? "badge-success" : "badge-warning"}`}
                  >
                    {course.status.toUpperCase()}
                  </span>
                </div>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    marginBottom: 6,
                  }}
                >
                  {course.description?.slice(0, 140)}
                  {(course.description?.length || 0) > 140 ? "..." : ""}
                </p>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {weekCount(course)} weeks &middot; {classCount(course)} classes
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 24 }}>
                {course.status === "draft" && (
                  <>
                    <button
                      className="btn-secondary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      <Pencil size={13} />
                      Edit
                    </button>
                    <button
                      className="btn-primary"
                      onClick={(e) => handlePublish(course.id, e)}
                      disabled={publishing === course.id}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      <Upload size={13} />
                      {publishing === course.id ? "Publishing..." : "Publish"}
                    </button>
                  </>
                )}
                <ArrowRight size={18} color="var(--text-tertiary)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
