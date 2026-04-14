"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { ArrowRight, Plus, Upload, Pencil, BookOpen, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface CourseSummary {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  status: string;
  created_at?: string;
  weeks: { id: string; classes: { id: string }[] }[];
}

export default function CourseManagementPage() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  const loadCourses = () => {
    fetchAPI("/instructor/courses")
      .then(setCourses)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCourses(); }, []);

  const handlePublish = async (courseId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPublishing(courseId);
    try {
      await fetchAPI(`/instructor/courses/${courseId}/publish`, { method: "POST" });
      loadCourses();
    } catch {}
    finally { setPublishing(null); }
  };

  const handleDelete = async (courseId: string, courseTitle: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${courseTitle}"? This will permanently remove the course, all its classes, assignments, and submissions. This cannot be undone.`)) return;
    setDeleting(courseId);
    try {
      await fetchAPI(`/instructor/courses/${courseId}`, { method: "DELETE" });
      loadCourses();
    } catch {}
    finally { setDeleting(null); }
  };

  const weekCount = (c: CourseSummary) => c.weeks?.length || 0;
  const classCount = (c: CourseSummary) => (c.weeks || []).reduce((sum, w) => sum + (w.classes?.length || 0), 0);
  const asnCount = (c: CourseSummary) => (c.weeks || []).reduce((sum, w) => (w.classes || []).reduce((s2, cl: any) => s2 + (cl.assignments?.length || 0), sum), 0);

  const published = courses.filter((c) => c.status === "published");
  const drafts = courses.filter((c) => c.status !== "published");

  const CourseCard = ({ course, i }: { course: CourseSummary; i: number }) => (
    <div
      onClick={() => router.push(`/instructor/courses/${course.id}`)}
      className={`card animate-in animate-in-${Math.min(i + 2, 6)}`}
      style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", cursor: "pointer" }}
    >
      {/* Color bar */}
      <div style={{ height: 4, background: course.status === "published" ? "var(--success)" : "var(--warning)" }} />
      <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <span className={`badge ${course.status === "published" ? "badge-success" : "badge-warning"}`} style={{ fontSize: 10 }}>
            {course.status.toUpperCase()}
          </span>
          <span className="badge badge-neutral" style={{ fontSize: 10 }}>{course.difficulty}</span>
        </div>
        <h3 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 17, color: "var(--text-heading)", marginBottom: 8, lineHeight: 1.3 }}>
          {course.title}
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5, flex: 1, marginBottom: 12 }}>
          {course.description?.slice(0, 120)}{(course.description?.length || 0) > 120 ? "..." : ""}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
            {weekCount(course)}w &middot; {classCount(course)}c &middot; {asnCount(course)}a
          </span>
          {course.created_at && (
            <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={10} />
              {new Date(course.created_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      {/* Actions */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", background: "var(--bg-secondary)" }}>
        <button
          className="btn-secondary"
          onClick={(e) => handleDelete(course.id, course.title, e)}
          disabled={deleting === course.id}
          style={{ padding: "5px 10px", fontSize: 11, color: "var(--danger, #dc2626)", borderColor: "var(--danger, #dc2626)", marginRight: "auto" }}
        >
          <Trash2 size={12} /> {deleting === course.id ? "Deleting..." : "Delete"}
        </button>
        {course.status === "draft" && (
          <>
            <button
              className="btn-secondary"
              onClick={(e) => { e.stopPropagation(); router.push(`/instructor/mission-control?edit=${course.id}`); }}
              style={{ padding: "5px 12px", fontSize: 11 }}
            >
              <Pencil size={12} /> Edit with AI
            </button>
            <button
              className="btn-primary"
              onClick={(e) => handlePublish(course.id, e)}
              disabled={publishing === course.id}
              style={{ padding: "5px 12px", fontSize: 11 }}
            >
              <Upload size={12} /> {publishing === course.id ? "..." : "Publish"}
            </button>
          </>
        )}
        <span style={{ display: "flex", alignItems: "center", color: "var(--text-tertiary)" }}>
          <ArrowRight size={14} />
        </span>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "60px 48px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 40 }}>
        <div>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>INSTRUCTOR PORTAL</span>
          <h1 className="display-heading" style={{ fontSize: 36 }}>Course Library</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 6 }}>{courses.length} courses &middot; {published.length} published &middot; {drafts.length} drafts</p>
        </div>
        <Link href="/instructor/mission-control?new=true" className="btn-primary" style={{ fontSize: 13, padding: "10px 18px" }}>
          <Plus size={16} /> Create Course
        </Link>
      </div>

      {loading ? (
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)", fontSize: 15 }}>Loading...</p>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <BookOpen size={48} color="var(--text-tertiary)" style={{ opacity: 0.3, marginBottom: 16 }} />
          <p style={{ color: "var(--text-secondary)", fontSize: 16, fontWeight: 500 }}>No courses yet.</p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 8 }}>
            Head to <Link href="/instructor/mission-control?new=true" style={{ color: "var(--accent)" }}>Mission Control</Link> to create one.
          </p>
        </div>
      ) : (
        <>
          {/* Published Section */}
          {published.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span className="overline" style={{ color: "var(--success)" }}>PUBLISHED</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{published.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {published.map((c, i) => <CourseCard key={c.id} course={c} i={i} />)}
              </div>
            </div>
          )}

          {/* Drafts Section */}
          {drafts.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span className="overline" style={{ color: "var(--warning)" }}>DRAFTS</span>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{drafts.length}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
                {drafts.map((c, i) => <CourseCard key={c.id} course={c} i={i} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
