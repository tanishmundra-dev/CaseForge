"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, BookOpen, Code, FileText, ExternalLink,
  Pencil, Upload, ArrowLeft, Loader2, Sparkles, Check, Save,
  Plus, Trash2, Link2,
} from "lucide-react";

interface ResourceLink { title: string; url: string; description?: string; type?: string; }

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/;
const extractYouTubeId = (url?: string): string | null => {
  if (!url) return null;
  const m = url.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
};

interface Assignment { title: string; description: string; type: string; difficulty: string; starter_code?: string; hints?: string[]; pitfalls?: string[]; aha_moment?: string; questions?: any[]; files?: any[]; test_cases?: any[]; rubric?: any[]; }
interface ClassItem { id?: string; number: number; title: string; description: string; assignments: Assignment[]; references?: ResourceLink[]; }
interface Week { id: string; number: number; title: string; classes: ClassItem[]; }
interface Course { id: string; title: string; description: string; difficulty: string; status: string; weeks: Week[]; }

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [selectedClass, setSelectedClass] = useState<{ week: number; class: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaDraft, setMetaDraft] = useState<{ title: string; description: string; difficulty: string } | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSavedAt, setMetaSavedAt] = useState<number | null>(null);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [weekDraft, setWeekDraft] = useState<string>("");
  const [editingContent, setEditingContent] = useState(false);
  const [contentDraft, setContentDraft] = useState<{ title: string; description: string; resources: ResourceLink[] } | null>(null);
  const [savingContent, setSavingContent] = useState(false);
  const [contentSavedAt, setContentSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetchAPI(`/instructor/courses/${courseId}`)
      .then((data: any) => {
        if (data?.weeks) {
          setCourse(data);
          // Auto-expand first week and select first class
          if (data.weeks.length > 0) {
            setExpandedWeeks(new Set([data.weeks[0].number]));
            if (data.weeks[0].classes?.length > 0) {
              setSelectedClass({ week: data.weeks[0].number, class: data.weeks[0].classes[0].number });
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId]);

  const toggleWeek = (n: number) => setExpandedWeeks((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });

  // Reset inline edit state when user switches classes
  useEffect(() => {
    setEditingContent(false);
    setContentDraft(null);
  }, [selectedClass?.week, selectedClass?.class]);

  const getSelectedClassData = (): ClassItem | null => {
    if (!course || !selectedClass) return null;
    const week = course.weeks.find((w) => w.number === selectedClass.week);
    return week?.classes.find((c) => c.number === selectedClass.class) || null;
  };

  const handlePublish = async () => {
    if (!course) return;
    setPublishing(true);
    try {
      await fetchAPI(`/instructor/courses/${course.id}/publish`, { method: "POST" });
      setCourse((p) => p ? { ...p, status: "published" } : null);
    } catch {}
    finally { setPublishing(false); }
  };

  const startMetaEdit = () => {
    if (!course) return;
    setMetaDraft({ title: course.title, description: course.description, difficulty: course.difficulty });
    setEditingMeta(true);
  };

  const saveMeta = async () => {
    if (!course || !metaDraft) return;
    setSavingMeta(true);
    try {
      await fetchAPI(`/instructor/courses/${course.id}`, {
        method: "PUT",
        body: JSON.stringify(metaDraft),
      });
      setCourse((p) => p ? { ...p, ...metaDraft } : p);
      setEditingMeta(false);
      setMetaSavedAt(Date.now());
      setTimeout(() => setMetaSavedAt((t) => (t && Date.now() - t >= 2500 ? null : t)), 2600);
    } catch { alert("Failed to save course details"); }
    finally { setSavingMeta(false); }
  };

  const startEditContent = () => {
    const c = getSelectedClassData();
    if (!c) return;
    setContentDraft({
      title: c.title,
      description: c.description || "",
      resources: (c.references || []).map((r) => ({ ...r })),
    });
    setEditingContent(true);
  };

  const updateResource = (idx: number, patch: Partial<ResourceLink>) => {
    setContentDraft((p) => p ? { ...p, resources: p.resources.map((r, i) => i === idx ? { ...r, ...patch } : r) } : p);
  };
  const addResource = () => {
    setContentDraft((p) => p ? { ...p, resources: [...p.resources, { type: "article", title: "", url: "" }] } : p);
  };
  const deleteResource = (idx: number) => {
    setContentDraft((p) => p ? { ...p, resources: p.resources.filter((_, i) => i !== idx) } : p);
  };

  const cancelEditContent = () => {
    setEditingContent(false);
    setContentDraft(null);
  };

  const saveContent = async () => {
    const c = getSelectedClassData();
    if (!c || !c.id || !contentDraft) return;
    if (!contentDraft.title.trim()) { alert("Title cannot be empty"); return; }
    setSavingContent(true);
    try {
      const cleanedResources = contentDraft.resources.filter((r) => (r.title?.trim() || r.url?.trim()));
      await fetchAPI(`/instructor/classes/${c.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: contentDraft.title,
          description: contentDraft.description,
          resource_links: cleanedResources,
        }),
      });
      setCourse((p) => p ? {
        ...p,
        weeks: p.weeks.map((w) => w.number !== selectedClass!.week ? w : {
          ...w,
          classes: w.classes.map((cc) => cc.number !== selectedClass!.class ? cc : { ...cc, title: contentDraft.title, description: contentDraft.description, references: cleanedResources }),
        }),
      } : p);
      setEditingContent(false);
      setContentDraft(null);
      setContentSavedAt(Date.now());
      setTimeout(() => setContentSavedAt(null), 2500);
    } catch { alert("Failed to save class content"); }
    finally { setSavingContent(false); }
  };

  const saveWeekTitle = async (weekId: string) => {
    const newTitle = weekDraft.trim();
    if (!newTitle) { setEditingWeekId(null); return; }
    try {
      await fetchAPI(`/instructor/weeks/${weekId}`, {
        method: "PUT",
        body: JSON.stringify({ title: newTitle }),
      });
      setCourse((p) => p ? { ...p, weeks: p.weeks.map((w) => w.id === weekId ? { ...w, title: newTitle } : w) } : p);
    } catch { alert("Failed to update week title"); }
    finally {
      setEditingWeekId(null);
      setWeekDraft("");
    }
  };

  const cls = getSelectedClassData();
  const typeIcon = (t: string) => t === "objective" ? <FileText size={13} /> : <Code size={13} />;
  const typeLabel = (t: string) => t === "objective" ? "Quiz" : t === "ide" ? "Project" : "Coding";
  const typeBadge = (t: string) => t === "objective" ? "badge-warning" : t === "ide" ? "badge-accent" : "badge-neutral";

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 56px)" }}>
      <Loader2 size={32} className="animate-pulse-slow" color="var(--accent)" />
    </div>
  );

  if (!course) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <p style={{ color: "var(--text-secondary)" }}>Course not found.</p>
      <Link href="/instructor/case-studies" style={{ color: "var(--accent)", marginTop: 12, display: "inline-block" }}>&larr; Back to courses</Link>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden", position: "relative" }}>
      {/* ═══ META-EDIT MODAL ═══ */}
      {editingMeta && metaDraft && (
        <div
          onClick={() => { if (!savingMeta) { setEditingMeta(false); setMetaDraft(null); } }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520, background: "var(--bg-primary)",
              border: "1px solid var(--border)", borderRadius: 12, padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Pencil size={14} color="var(--accent)" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-heading)" }}>Edit Course Details</h3>
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>Title</label>
            <input
              className="input"
              value={metaDraft.title}
              onChange={(e) => setMetaDraft({ ...metaDraft, title: e.target.value })}
              style={{ width: "100%", marginBottom: 14 }}
              autoFocus
            />

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>Description</label>
            <textarea
              className="input"
              value={metaDraft.description}
              onChange={(e) => setMetaDraft({ ...metaDraft, description: e.target.value })}
              rows={4}
              style={{ width: "100%", marginBottom: 14, resize: "vertical", fontFamily: "inherit" }}
            />

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>Difficulty</label>
            <select
              className="input"
              value={metaDraft.difficulty}
              onChange={(e) => setMetaDraft({ ...metaDraft, difficulty: e.target.value })}
              style={{ width: "100%", marginBottom: 20 }}
            >
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
            </select>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn-secondary"
                onClick={() => { setEditingMeta(false); setMetaDraft(null); }}
                disabled={savingMeta}
                style={{ fontSize: 13, padding: "8px 14px" }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={saveMeta}
                disabled={savingMeta || !metaDraft.title.trim()}
                style={{ fontSize: 13, padding: "8px 14px" }}
              >
                {savingMeta ? <><Loader2 size={13} className="animate-pulse-slow" /> Saving...</> : <><Save size={13} /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ SAVED TOAST ═══ */}
      {metaSavedAt && (
        <div
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 1100,
            padding: "10px 16px", background: "var(--success, #10b981)", color: "#fff",
            borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <Check size={14} /> Course details saved
        </div>
      )}

      {/* ═══ SIDEBAR — Weeks & Classes ═══ */}
      <div style={{ width: 280, minWidth: 280, borderRight: "1px solid var(--border)", overflowY: "auto", background: "var(--bg-secondary)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
          <Link href="/instructor/case-studies" style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
            <ArrowLeft size={12} /> All Courses
          </Link>
          <h2
            onClick={startMetaEdit}
            title="Click to edit course details"
            style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--text-heading)", lineHeight: 1.3, marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 4 }}
          >
            <span style={{ flex: 1 }}>{course.title}</span>
            <Pencil size={10} style={{ opacity: 0.3, marginTop: 3 }} />
          </h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={`badge ${course.status === "published" ? "badge-success" : "badge-warning"}`} style={{ fontSize: 10 }}>{course.status.toUpperCase()}</span>
            <span className="badge badge-neutral" style={{ fontSize: 10 }}>{course.difficulty}</span>
          </div>
        </div>

        {/* Week list */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {course.weeks.map((week) => {
            const wOpen = expandedWeeks.has(week.number);
            return (
              <div key={week.number}>
                <div
                  onClick={() => toggleWeek(week.number)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer", userSelect: "none", borderLeft: "3px solid transparent" }}
                >
                  {wOpen ? <ChevronDown size={14} color="var(--accent)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-subtle)", padding: "1px 6px", borderRadius: 3 }}>W{week.number}</span>
                  {editingWeekId === week.id ? (
                    <input
                      className="input"
                      autoFocus
                      value={weekDraft}
                      onChange={(e) => setWeekDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveWeekTitle(week.id); }
                        if (e.key === "Escape") { setEditingWeekId(null); setWeekDraft(""); }
                      }}
                      onBlur={() => saveWeekTitle(week.id)}
                      style={{ flex: 1, fontSize: 12, padding: "2px 6px", height: 24 }}
                    />
                  ) : (
                    <span
                      onClick={(e) => { e.stopPropagation(); setEditingWeekId(week.id); setWeekDraft(week.title); }}
                      title="Click to rename week"
                      style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {week.title}
                    </span>
                  )}
                </div>

                {wOpen && (
                  <div>
                    {week.classes.map((c) => {
                      const isSelected = selectedClass?.week === week.number && selectedClass?.class === c.number;
                      return (
                        <div
                          key={c.number}
                          onClick={() => setSelectedClass({ week: week.number, class: c.number })}
                          style={{
                            padding: "8px 16px 8px 44px", cursor: "pointer", fontSize: 13,
                            color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                            background: isSelected ? "var(--accent-subtle)" : "transparent",
                            borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                            fontWeight: isSelected ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, marginRight: 6, opacity: 0.5 }}>{c.number}.</span>
                          {c.title}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <Link
            href={`/instructor/mission-control?edit=${course.id}`}
            className="btn-secondary"
            style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}
          >
            <Sparkles size={13} /> Edit with AI
          </Link>
          {course.status === "draft" && (
            <button
              className="btn-primary"
              onClick={handlePublish}
              disabled={publishing}
              style={{ flex: 1, fontSize: 12, padding: "8px 12px" }}
            >
              <Upload size={13} /> {publishing ? "..." : "Publish"}
            </button>
          )}
        </div>
      </div>

      {/* ═══ MAIN PANEL — Class Content ═══ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-primary)" }}>
        {!cls ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-tertiary)" }}>
            Select a class from the sidebar
          </div>
        ) : (
          <div style={{ maxWidth: 800 }} className="animate-in">
            {/* Class header */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Week {selectedClass!.week} &middot; Class {cls.number}
                </span>
                {!editingContent ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {contentSavedAt && (
                      <span style={{ fontSize: 11, color: "var(--success, #10b981)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Check size={12} /> Saved
                      </span>
                    )}
                    <button
                      className="btn-primary"
                      onClick={startEditContent}
                      style={{ padding: "6px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <Pencil size={12} /> Edit Content
                    </button>
                    {cls.id && (
                      <a
                        href={`/instructor/classes/${cls.id}`}
                        className="btn-secondary"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        title="Open the full class editor (learning units, resources, etc.)"
                      >
                        Full Editor
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-secondary"
                      onClick={cancelEditContent}
                      disabled={savingContent}
                      style={{ padding: "6px 12px", fontSize: 12 }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary"
                      onClick={saveContent}
                      disabled={savingContent || !contentDraft?.title.trim()}
                      style={{ padding: "6px 12px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      {savingContent ? <Loader2 size={12} className="animate-pulse-slow" /> : <Check size={12} />}
                      {savingContent ? "Saving..." : "Save"}
                    </button>
                  </div>
                )}
              </div>

              {/* Title */}
              {editingContent && contentDraft ? (
                <input
                  className="input"
                  autoFocus
                  value={contentDraft.title}
                  onChange={(e) => setContentDraft({ ...contentDraft, title: e.target.value })}
                  placeholder="Class title"
                  style={{ width: "100%", fontSize: 22, fontWeight: 700, padding: "6px 10px", marginBottom: 12, fontFamily: "var(--font-display)" }}
                />
              ) : (
                <h1 className="display-heading" style={{ fontSize: 26, marginTop: 6, marginBottom: 12 }}>{cls.title}</h1>
              )}

              {/* Description / Lecture Notes */}
              {editingContent && contentDraft ? (
                <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--accent)", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <BookOpen size={14} color="var(--accent)" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" }}>
                      Lecture Notes / Description
                    </span>
                  </div>
                  <textarea
                    className="input"
                    value={contentDraft.description}
                    onChange={(e) => setContentDraft({ ...contentDraft, description: e.target.value })}
                    placeholder="Write the lecture notes or class description..."
                    rows={8}
                    style={{ width: "100%", fontSize: 14, lineHeight: 1.7, padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              ) : cls.description ? (
                <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <BookOpen size={14} color="var(--text-tertiary)" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>
                      {cls.description.length > 200 ? "Lecture Notes" : "Overview"}
                    </span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{cls.description}</p>
                </div>
              ) : null}
            </div>

            {/* Assignments */}
            {cls.assignments.map((asn, ai) => (
              <div key={ai} style={{ marginBottom: 20, padding: "20px 24px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  {typeIcon(asn.type)}
                  <h3 style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>{asn.title || "Untitled"}</h3>
                  <span className={`badge ${typeBadge(asn.type)}`} style={{ fontSize: 11 }}>{typeLabel(asn.type)}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 11 }}>{asn.difficulty}</span>
                </div>

                {asn.description && <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 16 }}>{asn.description}</p>}

                {/* Coding: starter code + test cases */}
                {asn.type === "coding" && (
                  <>
                    {asn.starter_code && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Starter Code</span>
                        <pre style={{ marginTop: 6, padding: "14px 16px", background: "#1a1a18", color: "#e8e4df", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.6 }}>{asn.starter_code}</pre>
                      </div>
                    )}
                    {(asn.test_cases?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Test Cases</span>
                        {asn.test_cases!.map((tc: any, ti: number) => (
                          <div key={ti} style={{ marginTop: 4, padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)" }}>
                            <span style={{ color: "var(--text-tertiary)" }}>Input:</span> {tc.input || "—"} &rarr; <span style={{ color: "var(--success)" }}>{tc.expected_output}</span>
                            {tc.description && <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>({tc.description})</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* IDE: files */}
                {asn.type === "ide" && asn.files?.map((f: any, fi: number) => (
                  <div key={fi} style={{ marginBottom: 10 }}>
                    <div style={{ display: "inline-block", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", padding: "4px 10px", background: "var(--bg-tertiary)", borderRadius: "6px 6px 0 0" }}>{f.name}</div>
                    <pre style={{ padding: "12px 16px", background: "#1a1a18", color: "#e8e4df", borderRadius: "0 8px 8px 8px", fontSize: 12, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.5 }}>{f.content}</pre>
                  </div>
                ))}

                {/* Quiz: questions */}
                {asn.type === "objective" && (asn.questions?.length ?? 0) > 0 && (
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>{asn.questions!.length} Questions</span>
                    {asn.questions!.map((q: any, qi: number) => (
                      <div key={qi} style={{ marginBottom: 12, padding: "12px 16px", background: "var(--bg-tertiary)", borderRadius: 6 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Q{qi + 1}. {q.question}</p>
                        {q.type === "mcq" && q.options?.map((opt: string, oi: number) => (
                          <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: oi === q.correct ? "var(--success)" : "var(--text-secondary)" }}>
                            <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${oi === q.correct ? "var(--success)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                              {String.fromCharCode(65 + oi)}
                            </span>
                            {opt} {oi === q.correct && <span style={{ fontSize: 10, color: "var(--success)" }}>(correct)</span>}
                          </div>
                        ))}
                        {q.type === "fill_up" && (
                          <p style={{ fontSize: 13, color: "var(--success)" }}>Answer: {q.answer}</p>
                        )}
                        {q.explanation && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6, fontStyle: "italic" }}>{q.explanation}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Rubric */}
                {(asn.rubric?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Rubric</span>
                    <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                      {asn.rubric!.map((r: any, ri: number) => (
                        <div key={ri} style={{ padding: "8px 12px", background: "var(--bg-tertiary)", borderRadius: 4, fontSize: 12 }}>
                          <strong>{r.criterion}</strong> <span style={{ color: "var(--text-tertiary)" }}>({r.weight}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hints */}
                {(asn.hints?.length ?? 0) > 0 && (
                  <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}><strong>Hints:</strong> {asn.hints!.join(" • ")}</p>
                )}
                {asn.aha_moment && (
                  <p style={{ fontSize: 12, color: "var(--accent)", marginTop: 6 }}><strong>Key Insight:</strong> {asn.aha_moment}</p>
                )}
              </div>
            ))}

            {/* References / External Source Links */}
            {editingContent && contentDraft ? (
              <div style={{ padding: "16px 20px", background: "var(--accent-subtle)", borderRadius: 10, marginTop: 20, border: "1px solid var(--accent)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <BookOpen size={14} color="var(--accent)" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", flex: 1 }}>External Source Links</span>
                  <button
                    className="btn-secondary"
                    onClick={addResource}
                    style={{ fontSize: 11, padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    <Plus size={11} /> Add Link
                  </button>
                </div>
                {contentDraft.resources.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontStyle: "italic" }}>
                    No external links yet — click &ldquo;Add Link&rdquo; to attach one.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {contentDraft.resources.map((ref, ri) => {
                      const ytId = extractYouTubeId(ref.url);
                      const urlInvalid = (ref.url || "").trim() && !ytId && ref.type === "video";
                      return (
                        <div key={ri} style={{ padding: "12px 14px", background: "var(--bg-primary)", borderRadius: 8, border: "1px solid var(--border)" }}>
                          {/* Header row: type + title + delete */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                            <select
                              value={ref.type || "article"}
                              onChange={(e) => updateResource(ri, { type: e.target.value })}
                              style={{ fontSize: 11, padding: "4px 8px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                            >
                              <option value="article">article</option>
                              <option value="video">video</option>
                              <option value="docs">docs</option>
                              <option value="book">book</option>
                              <option value="other">other</option>
                            </select>
                            <input
                              className="input"
                              placeholder="Title"
                              value={ref.title || ""}
                              onChange={(e) => updateResource(ri, { title: e.target.value })}
                              style={{ flex: 1, fontSize: 13, fontWeight: 600, padding: "5px 10px" }}
                            />
                            <button
                              onClick={() => deleteResource(ri)}
                              title="Delete link"
                              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--danger, #dc2626)", padding: "4px 8px", display: "flex", alignItems: "center" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>

                          {/* URL row with Open icon */}
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                            <Link2 size={12} color="var(--text-tertiary)" />
                            <input
                              className="input"
                              type="url"
                              placeholder="https://..."
                              value={ref.url || ""}
                              onChange={(e) => updateResource(ri, { url: e.target.value })}
                              style={{ flex: 1, fontSize: 12, padding: "4px 8px", fontFamily: "var(--font-mono)" }}
                            />
                            {ref.url && (
                              <a
                                href={ref.url}
                                target="_blank"
                                rel="noreferrer"
                                title="Open link in new tab"
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: ytId ? "#DC2626" : "var(--accent)", textDecoration: "none", padding: "4px 8px", borderRadius: 4, background: ytId ? "#DC262610" : "var(--accent-subtle)" }}
                              >
                                {ytId ? "▶ Open in YouTube" : "Open"}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>

                          {urlInvalid && (
                            <div style={{ fontSize: 11, color: "var(--danger, #dc2626)", marginBottom: 8 }}>
                              Not a valid YouTube URL — expected youtube.com/watch?v=… or youtu.be/…
                            </div>
                          )}

                          {/* Description */}
                          <input
                            className="input"
                            placeholder="Description (optional)"
                            value={ref.description || ""}
                            onChange={(e) => updateResource(ri, { description: e.target.value })}
                            style={{ width: "100%", fontSize: 11, padding: "4px 8px" }}
                          />

                          {/* Student preview — YouTube embed */}
                          {ytId && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>
                                <ExternalLink size={10} /> Student Preview
                              </div>
                              <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden", background: "#000" }}>
                                <iframe
                                  src={`https://www.youtube.com/embed/${ytId}`}
                                  title={ref.title || "YouTube preview"}
                                  allowFullScreen
                                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : cls.references && cls.references.length > 0 ? (
              <div style={{ padding: "16px 20px", background: "var(--accent-subtle)", borderRadius: 10, marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <BookOpen size={14} color="var(--accent)" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" }}>External Source Links</span>
                </div>
                {cls.references.map((ref, ri) => (
                  <div key={ri} style={{ marginBottom: 6 }}>
                    <a href={ref.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>
                      {ref.title} <ExternalLink size={10} style={{ verticalAlign: "middle" }} />
                    </a>
                    {ref.description && <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{ref.description}</p>}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
