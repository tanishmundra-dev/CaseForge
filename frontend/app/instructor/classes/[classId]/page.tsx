"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  ArrowLeft, Plus, Trash2, Save, Code, FileText, FolderOpen,
  ChevronDown, ChevronRight, Loader2, Check, Play, Eye, EyeOff, ExternalLink, AlertCircle,
} from "lucide-react";

interface TestCase { input: string; expected_output: string; description: string; }
interface RubricItem { criterion: string; excellent: string; acceptable: string; poor: string; weight: number; }
interface Question { type: string; question: string; options?: string[]; correct?: number; answer?: string; explanation: string; }
interface FileItem { name: string; content: string; language: string; }

interface Assignment {
  id: string;
  title: string;
  description: string;
  type: string;
  difficulty: string;
  starter_code: string;
  solution_code: string;
  test_cases: TestCase[];
  rubric: RubricItem[];
  hints: string[];
  pitfalls: string[];
  aha_moment: string;
  questions: Question[];
  files: FileItem[];
}

interface LearningUnit {
  type: string;
  title: string;
  duration?: number;
  content?: string;
  completion_type?: string;
  video_url?: string;
  video_search_query?: string;
  video_channel?: string;
  questions?: any[];
}

interface ResourceLink {
  type?: string;
  title: string;
  url: string;
  description?: string;
  channel?: string;
  source?: string;
}

interface ClassDetail {
  id: string;
  number: number;
  title: string;
  description: string;
  theory_content?: string;
  learning_units?: LearningUnit[];
  resource_links?: ResourceLink[];
  week_number: number;
  week_title: string;
  course_id: string;
  course_title: string;
  assignments: Assignment[];
}

// Accept full YouTube URL forms: youtube.com/watch?v=, youtu.be/, youtube.com/embed/
const YOUTUBE_REGEX = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
}

export default function ClassEditorPage() {
  const params = useParams();
  const classId = params.classId as string;
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);

  const load = () => {
    fetchAPI(`/instructor/classes/${classId}`)
      .then(setCls)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [classId]);

  // ── Class-level edit state (learning units, resources, title/description/theory) ──
  const [savingClass, setSavingClass] = useState(false);
  const [classSavedAt, setClassSavedAt] = useState<number | null>(null);
  const [previewUnit, setPreviewUnit] = useState<number | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<number | null>(null);

  const updateClassField = (field: "title" | "description" | "theory_content", value: string) => {
    setCls((p) => p ? { ...p, [field]: value } : p);
  };

  const updateUnit = (index: number, field: keyof LearningUnit, value: any) => {
    setCls((p) => {
      if (!p) return p;
      const units = [...(p.learning_units || [])];
      if (!units[index]) return p;
      units[index] = { ...units[index], [field]: value };
      return { ...p, learning_units: units };
    });
  };

  const moveUnit = (index: number, dir: -1 | 1) => {
    setCls((p) => {
      if (!p) return p;
      const units = [...(p.learning_units || [])];
      const ni = index + dir;
      if (ni < 0 || ni >= units.length) return p;
      [units[index], units[ni]] = [units[ni], units[index]];
      return { ...p, learning_units: units };
    });
    setExpandedUnit((e) => (e === index ? index + dir : e === index + dir ? index : e));
  };

  const deleteUnit = (index: number) => {
    if (!confirm("Delete this learning unit? This cannot be undone until you Save.")) return;
    setCls((p) => {
      if (!p) return p;
      const units = (p.learning_units || []).filter((_, i) => i !== index);
      return { ...p, learning_units: units };
    });
    setExpandedUnit(null);
  };

  const addUnit = (type: "video" | "reading" | "activity" | "quiz") => {
    const templates: Record<string, LearningUnit> = {
      video: { type: "video", title: "New Video", duration: 10, content: "", video_url: "", video_channel: "" },
      reading: { type: "reading", title: "New Reading", duration: 15, content: "## Heading\n\nWrite content here in markdown." },
      activity: { type: "activity", title: "New Activity", duration: 20, content: "Describe the activity here." },
      quiz: { type: "quiz", title: "New Quiz", duration: 5, content: "", questions: [{ type: "mcq", question: "Sample question?", options: ["A", "B", "C", "D"], correct: 0, explanation: "" }] },
    };
    setCls((p) => {
      if (!p) return p;
      const units = [...(p.learning_units || []), templates[type]];
      return { ...p, learning_units: units };
    });
    setExpandedUnit((cls?.learning_units?.length) || 0);
  };

  // ── Resource links ──
  const updateResource = (index: number, field: keyof ResourceLink, value: string) => {
    setCls((p) => {
      if (!p) return p;
      const res = [...(p.resource_links || [])];
      if (!res[index]) return p;
      res[index] = { ...res[index], [field]: value };
      return { ...p, resource_links: res };
    });
  };
  const deleteResource = (index: number) => {
    setCls((p) => p ? { ...p, resource_links: (p.resource_links || []).filter((_, i) => i !== index) } : p);
  };
  const addResource = () => {
    setCls((p) => p ? { ...p, resource_links: [...(p.resource_links || []), { type: "article", title: "", url: "", description: "" }] } : p);
  };

  const handleSaveClass = async () => {
    if (!cls) return;
    setSavingClass(true);
    try {
      await fetchAPI(`/instructor/classes/${cls.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: cls.title,
          description: cls.description,
          theory_content: cls.theory_content || "",
          learning_units: cls.learning_units || [],
          resource_links: cls.resource_links || [],
        }),
      });
      setClassSavedAt(Date.now());
      setTimeout(() => setClassSavedAt((t) => (t && Date.now() - t >= 2500 ? null : t)), 2600);
    } catch {
      alert("Failed to save class. Check the console for details.");
    } finally {
      setSavingClass(false);
    }
  };

  const handleSaveAssignment = async (asn: Assignment) => {
    setSaving(asn.id);
    try {
      await fetchAPI(`/instructor/assignments/${asn.id}`, {
        method: "PUT",
        body: JSON.stringify(asn),
      });
    } catch { alert("Save failed"); }
    finally { setSaving(null); }
  };

  const handleDeleteAssignment = async (asnId: string) => {
    if (!confirm("Delete this assignment?")) return;
    try {
      await fetchAPI(`/instructor/assignments/${asnId}`, { method: "DELETE" });
      setCls((p) => p ? { ...p, assignments: p.assignments.filter((a) => a.id !== asnId) } : p);
    } catch { alert("Delete failed"); }
  };

  const handleAddAssignment = async (type: string) => {
    setAddingType(type);
    const template: Record<string, any> = {
      coding: { title: "New Coding Exercise", description: "", type: "coding", difficulty: "Intermediate", starter_code: "# Write your solution\ndef solve():\n    pass\n\nprint(solve())", solution_code: "", test_cases: [{ input: "", expected_output: "", description: "Basic test" }], rubric: [{ criterion: "Correctness", excellent: "All tests pass", acceptable: "Most pass", poor: "Fails", weight: 60 }, { criterion: "Code Quality", excellent: "Clean", acceptable: "OK", poor: "Messy", weight: 40 }], hints: [], pitfalls: [], questions: [], files: [] },
      objective: { title: "New Quiz", description: "", type: "objective", difficulty: "Intermediate", starter_code: "", solution_code: "", test_cases: [], rubric: [], hints: [], pitfalls: [], questions: [{ type: "mcq", question: "Question?", options: ["A", "B", "C", "D"], correct: 0, explanation: "Explanation" }], files: [] },
      ide: { title: "New Project", description: "", type: "ide", difficulty: "Intermediate", starter_code: "", solution_code: "", test_cases: [], rubric: [{ criterion: "Functionality", excellent: "Works fully", acceptable: "Partially works", poor: "Broken", weight: 100 }], hints: [], pitfalls: [], questions: [], files: [{ name: "index.html", content: "<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>", language: "html" }] },
    };
    try {
      const created = await fetchAPI(`/instructor/classes/${classId}/assignments`, {
        method: "POST",
        body: JSON.stringify(template[type] || template.coding),
      });
      setCls((p) => p ? { ...p, assignments: [...p.assignments, created] } : p);
      setExpanded(created.id);
    } catch { alert("Failed to create assignment"); }
    finally { setAddingType(null); }
  };

  const updateAsn = (id: string, field: string, value: any) => {
    setCls((p) => {
      if (!p) return p;
      return { ...p, assignments: p.assignments.map((a) => a.id === id ? { ...a, [field]: value } : a) };
    });
  };

  const typeIcon = (t: string) => t === "objective" ? <FileText size={16} /> : t === "ide" ? <FolderOpen size={16} /> : <Code size={16} />;
  const typeLabel = (t: string) => t === "objective" ? "Quiz" : t === "ide" ? "Project" : "Coding";
  const typeBadge = (t: string) => t === "objective" ? "badge-warning" : t === "ide" ? "badge-accent" : "badge-neutral";

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Loader2 size={28} className="animate-pulse-slow" color="var(--accent)" /></div>;
  if (!cls) return <div style={{ padding: 60 }}><p style={{ color: "var(--text-secondary)" }}>Class not found.</p></div>;

  return (
    <div style={{ padding: "40px 48px 80px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb animate-in animate-in-1" style={{ marginBottom: 24 }}>
        <Link href="/instructor/case-studies">Courses</Link>
        <span className="separator">/</span>
        <Link href={`/instructor/courses/${cls.course_id}`}>{cls.course_title}</Link>
        <span className="separator">/</span>
        <span className="current">Week {cls.week_number} &middot; Class {cls.number}</span>
      </div>

      {/* Header — fully editable (title, description, theory_content) */}
      <div className="animate-in animate-in-1" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            WEEK {cls.week_number} &middot; CLASS {cls.number}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {classSavedAt && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--success)", fontSize: 12 }}>
                <Check size={13} /> Saved — students see updates on next load
              </span>
            )}
            <button
              className="btn-primary"
              onClick={handleSaveClass}
              disabled={savingClass}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              {savingClass ? <Loader2 size={14} className="animate-pulse-slow" /> : <Save size={14} />}
              {savingClass ? " Saving..." : " Save Class"}
            </button>
          </div>
        </div>

        <input
          className="input"
          value={cls.title}
          onChange={(e) => updateClassField("title", e.target.value)}
          placeholder="Class title"
          style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, padding: "6px 10px", marginBottom: 10, color: "var(--text-heading)", background: "transparent", border: "1px dashed transparent" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
        />

        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginTop: 12, marginBottom: 4 }}>
          Description (shown on class card)
        </label>
        <textarea
          className="input"
          value={cls.description}
          onChange={(e) => updateClassField("description", e.target.value)}
          rows={2}
          placeholder="Brief description…"
          style={{ fontSize: 14, lineHeight: 1.6, resize: "vertical" }}
        />

        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginTop: 16, marginBottom: 4 }}>
          Theory / Lecture Content (Markdown) — shown when there are no learning units
        </label>
        <textarea
          className="input"
          value={cls.theory_content || ""}
          onChange={(e) => updateClassField("theory_content", e.target.value)}
          rows={6}
          placeholder="# Heading\n\nTeach the lesson here…"
          style={{ fontSize: 13, fontFamily: "var(--font-mono)", lineHeight: 1.6, resize: "vertical" }}
        />
      </div>

      {/* Learning Units — fully editable (add / delete / reorder / edit all fields) */}
      <div className="animate-in animate-in-2" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="overline">LEARNING UNITS ({(cls.learning_units || []).length})</span>
          <div style={{ display: "flex", gap: 6 }}>
            {(["video", "reading", "activity", "quiz"] as const).map((t) => (
              <button key={t} className="btn-secondary" onClick={() => addUnit(t)} style={{ padding: "5px 10px", fontSize: 11 }}>
                <Plus size={11} /> {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {(cls.learning_units || []).length === 0 && (
          <div style={{ padding: "20px 24px", border: "1px dashed var(--border)", borderRadius: 10, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No learning units yet. Add one above, or students will see the Theory Content fallback.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(cls.learning_units || []).map((unit, ui) => {
            const videoId = extractYouTubeId(unit.video_url || "");
            const urlIsInvalid = (unit.video_url || "").length > 0 && !videoId;
            const isPreview = previewUnit === ui;
            const isOpen = expandedUnit === ui;
            const typeColor: Record<string, string> = { video: "#DC2626", reading: "#D97706", activity: "#16A34A", quiz: "#7C3AED", checkpoint_quiz: "#7C3AED", checkpoint_coding: "#0891B2", graded_assignment: "#EA580C" };
            const color = typeColor[unit.type] || "var(--text-tertiary)";
            const total = (cls.learning_units || []).length;
            return (
              <div key={ui} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header row — always visible */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: isOpen ? "var(--bg-secondary)" : "transparent" }}>
                  <button onClick={() => setExpandedUnit(isOpen ? null : ui)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, display: "flex" }}>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <select
                    value={unit.type || "reading"}
                    onChange={(e) => updateUnit(ui, "type", e.target.value)}
                    className="input"
                    style={{ width: 110, fontSize: 11, padding: "4px 8px", color, fontWeight: 700, textTransform: "uppercase" }}
                  >
                    <option value="video">Video</option>
                    <option value="reading">Reading</option>
                    <option value="activity">Activity</option>
                    <option value="quiz">Quiz</option>
                    <option value="checkpoint_quiz">Quiz (short)</option>
                    <option value="checkpoint_coding">Coding</option>
                    <option value="graded_assignment">Assignment</option>
                  </select>
                  <input
                    className="input"
                    value={unit.title || ""}
                    onChange={(e) => updateUnit(ui, "title", e.target.value)}
                    placeholder="Unit title"
                    style={{ flex: 1, fontSize: 14, fontWeight: 600 }}
                  />
                  <input
                    className="input"
                    type="number"
                    value={unit.duration ?? ""}
                    onChange={(e) => updateUnit(ui, "duration", parseInt(e.target.value, 10) || 0)}
                    placeholder="min"
                    style={{ width: 70, fontSize: 12 }}
                  />
                  <button onClick={() => moveUnit(ui, -1)} disabled={ui === 0} title="Move up" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: ui === 0 ? "not-allowed" : "pointer", color: "var(--text-secondary)", padding: "3px 6px", opacity: ui === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveUnit(ui, 1)} disabled={ui === total - 1} title="Move down" style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: ui === total - 1 ? "not-allowed" : "pointer", color: "var(--text-secondary)", padding: "3px 6px", opacity: ui === total - 1 ? 0.4 : 1 }}>↓</button>
                  <button onClick={() => deleteUnit(ui)} title="Delete unit" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={14} /></button>
                </div>

                {/* Expanded editor */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px", background: "var(--bg-secondary)" }}>
                    {/* YouTube URL + channel + preview */}
                    <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginBottom: 8 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", background: "#DC262610", border: "1px solid #DC262620", borderRadius: 6, flexShrink: 0 }}>
                        <Play size={13} color="#DC2626" />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>YouTube URL</span>
                      </div>
                      <input
                        className="input"
                        value={unit.video_url || ""}
                        onChange={(e) => updateUnit(ui, "video_url", e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        style={{ flex: 1, fontSize: 12, fontFamily: "var(--font-mono)", borderColor: urlIsInvalid ? "var(--danger)" : undefined }}
                      />
                      <input
                        className="input"
                        value={unit.video_channel || ""}
                        onChange={(e) => updateUnit(ui, "video_channel", e.target.value)}
                        placeholder="Channel"
                        style={{ width: 160, fontSize: 12 }}
                      />
                      <button
                        className="btn-secondary"
                        onClick={() => setPreviewUnit(isPreview ? null : ui)}
                        disabled={!videoId}
                        title={videoId ? (isPreview ? "Hide preview" : "Preview what students will see") : "Paste a valid YouTube URL to preview"}
                        style={{ padding: "6px 10px", fontSize: 11 }}
                      >
                        {isPreview ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Preview</>}
                      </button>
                      {videoId && (
                        <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" className="btn-secondary" style={{ padding: "6px 10px", fontSize: 11, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          Open <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    {urlIsInvalid && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--danger)", marginBottom: 8 }}>
                        <AlertCircle size={13} /> Not a valid YouTube URL. Use youtube.com/watch?v=… or youtu.be/…
                      </div>
                    )}

                    {isPreview && videoId && (
                      <div style={{ marginBottom: 12, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border)" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Student Preview</span>
                          <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>youtube.com/watch?v={videoId}</span>
                        </div>
                        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
                          <iframe src={`https://www.youtube.com/embed/${videoId}?rel=0`} title={`Preview: ${unit.title || videoId}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
                        </div>
                      </div>
                    )}

                    {/* Unit content body (markdown) — hidden for quiz, optional for others */}
                    {unit.type !== "quiz" && (
                      <>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Content (Markdown)</label>
                        <textarea
                          className="input"
                          value={unit.content || ""}
                          onChange={(e) => updateUnit(ui, "content", e.target.value)}
                          rows={8}
                          placeholder={"## Heading\n\nWrite the unit content in markdown. Supports ```code```, `inline`, **bold**, *italic*, - bullets."}
                          style={{ fontSize: 13, fontFamily: "var(--font-mono)", lineHeight: 1.6, resize: "vertical" }}
                        />
                      </>
                    )}

                    {/* Quiz unit editor */}
                    {unit.type === "quiz" && (
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Questions ({(unit.questions || []).length})</label>
                          <button
                            className="btn-secondary"
                            onClick={() => updateUnit(ui, "questions", [...(unit.questions || []), { type: "mcq", question: "", options: ["", "", "", ""], correct: 0, explanation: "" }])}
                            style={{ fontSize: 11, padding: "3px 8px" }}
                          >
                            <Plus size={11} /> Question
                          </button>
                        </div>
                        {(unit.questions || []).map((q: any, qi: number) => (
                          <div key={qi} style={{ padding: "10px 12px", background: "var(--bg-tertiary)", borderRadius: 8, marginBottom: 8, border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>Q{qi + 1}</span>
                              <select
                                className="input"
                                value={q.type || "mcq"}
                                onChange={(e) => { const qs = [...(unit.questions || [])]; qs[qi] = { ...qs[qi], type: e.target.value }; updateUnit(ui, "questions", qs); }}
                                style={{ width: 100, fontSize: 11, padding: "4px 8px" }}
                              >
                                <option value="mcq">MCQ</option>
                                <option value="fill_up">Fill Up</option>
                              </select>
                              <div style={{ flex: 1 }} />
                              <button onClick={() => { const qs = (unit.questions || []).filter((_: any, j: number) => j !== qi); updateUnit(ui, "questions", qs); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={12} /></button>
                            </div>
                            <input className="input" value={q.question || ""} placeholder="Question text" onChange={(e) => { const qs = [...(unit.questions || [])]; qs[qi] = { ...qs[qi], question: e.target.value }; updateUnit(ui, "questions", qs); }} style={{ marginBottom: 6, fontSize: 13 }} />
                            {q.type === "mcq" && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                {(q.options || []).map((opt: string, oi: number) => (
                                  <div key={oi} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <input type="radio" name={`u${ui}-q${qi}-correct`} checked={q.correct === oi} onChange={() => { const qs = [...(unit.questions || [])]; qs[qi] = { ...qs[qi], correct: oi }; updateUnit(ui, "questions", qs); }} />
                                    <input className="input" value={opt} onChange={(e) => { const qs = [...(unit.questions || [])]; const opts = [...(qs[qi].options || [])]; opts[oi] = e.target.value; qs[qi] = { ...qs[qi], options: opts }; updateUnit(ui, "questions", qs); }} style={{ fontSize: 12, flex: 1 }} />
                                  </div>
                                ))}
                              </div>
                            )}
                            {q.type === "fill_up" && (
                              <input className="input" value={q.answer || ""} placeholder="Correct answer" onChange={(e) => { const qs = [...(unit.questions || [])]; qs[qi] = { ...qs[qi], answer: e.target.value }; updateUnit(ui, "questions", qs); }} style={{ fontSize: 12, marginTop: 4 }} />
                            )}
                            <input className="input" value={q.explanation || ""} placeholder="Explanation (shown after submit)" onChange={(e) => { const qs = [...(unit.questions || [])]; qs[qi] = { ...qs[qi], explanation: e.target.value }; updateUnit(ui, "questions", qs); }} style={{ fontSize: 12, marginTop: 4 }} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resource Links / References */}
      <div className="animate-in animate-in-2" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="overline">RESOURCES &amp; REFERENCES ({(cls.resource_links || []).length})</span>
          <button className="btn-secondary" onClick={addResource} style={{ padding: "5px 10px", fontSize: 11 }}>
            <Plus size={11} /> Add Resource
          </button>
        </div>
        {(cls.resource_links || []).length === 0 && (
          <div style={{ padding: "16px 20px", border: "1px dashed var(--border)", borderRadius: 10, color: "var(--text-tertiary)", fontSize: 13, textAlign: "center" }}>
            No resources linked to this class.
          </div>
        )}
        {(cls.resource_links || []).map((res, ri) => (
          <div key={ri} className="card" style={{ padding: "10px 12px", marginBottom: 8, display: "grid", gridTemplateColumns: "120px 1fr 2fr auto", gap: 8, alignItems: "center" }}>
            <select className="input" value={res.type || "article"} onChange={(e) => updateResource(ri, "type", e.target.value)} style={{ fontSize: 12, padding: "4px 8px" }}>
              <option value="video">Video</option>
              <option value="article">Article</option>
              <option value="docs">Docs</option>
              <option value="other">Other</option>
            </select>
            <input className="input" value={res.title} onChange={(e) => updateResource(ri, "title", e.target.value)} placeholder="Title" style={{ fontSize: 13 }} />
            <input className="input" value={res.url} onChange={(e) => updateResource(ri, "url", e.target.value)} placeholder="https://…" style={{ fontSize: 12, fontFamily: "var(--font-mono)" }} />
            <button onClick={() => deleteResource(ri)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {/* Assignments */}
      <div className="animate-in animate-in-2">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span className="overline">ASSIGNMENTS ({cls.assignments.length})</span>
          <div style={{ display: "flex", gap: 6 }}>
            {["coding", "objective", "ide"].map((t) => (
              <button
                key={t}
                className="btn-secondary"
                onClick={() => handleAddAssignment(t)}
                disabled={addingType === t}
                style={{ padding: "5px 10px", fontSize: 11 }}
              >
                <Plus size={12} /> {addingType === t ? "..." : typeLabel(t)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cls.assignments.map((asn) => {
            const isOpen = expanded === asn.id;
            return (
              <div key={asn.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Assignment header */}
                <div
                  onClick={() => setExpanded(isOpen ? null : asn.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer" }}
                >
                  {isOpen ? <ChevronDown size={14} color="var(--accent)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                  {typeIcon(asn.type)}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{asn.title}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 8 }}>{asn.description.slice(0, 60)}{asn.description.length > 60 ? "..." : ""}</span>
                  </div>
                  <span className={`badge ${typeBadge(asn.type)}`} style={{ fontSize: 10 }}>{typeLabel(asn.type)}</span>
                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>{asn.difficulty}</span>
                </div>

                {/* Expanded editor */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "20px 18px", background: "var(--bg-secondary)" }}>
                    {/* Common fields */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Title</label>
                        <input className="input" value={asn.title} onChange={(e) => updateAsn(asn.id, "title", e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Difficulty</label>
                        <select className="input" value={asn.difficulty} onChange={(e) => updateAsn(asn.id, "difficulty", e.target.value)}>
                          <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Description</label>
                      <textarea className="input" value={asn.description} onChange={(e) => updateAsn(asn.id, "description", e.target.value)} rows={3} style={{ resize: "vertical" }} />
                    </div>

                    {/* Coding-specific fields */}
                    {asn.type === "coding" && (
                      <>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Starter Code</label>
                          <textarea className="input" value={asn.starter_code} onChange={(e) => updateAsn(asn.id, "starter_code", e.target.value)} rows={8} style={{ fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical" }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Solution Code (hidden from students)</label>
                          <textarea className="input" value={asn.solution_code} onChange={(e) => updateAsn(asn.id, "solution_code", e.target.value)} rows={8} style={{ fontFamily: "var(--font-mono)", fontSize: 12, resize: "vertical", borderColor: "rgba(22,163,74,0.3)" }} />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Test Cases ({asn.test_cases.length})</label>
                          {asn.test_cases.map((tc, ti) => (
                            <div key={ti} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 8, marginBottom: 6, alignItems: "center" }}>
                              <input className="input" value={tc.input} placeholder="Input" onChange={(e) => { const tcs = [...asn.test_cases]; tcs[ti] = { ...tcs[ti], input: e.target.value }; updateAsn(asn.id, "test_cases", tcs); }} style={{ fontSize: 12, fontFamily: "var(--font-mono)" }} />
                              <input className="input" value={tc.expected_output} placeholder="Expected output" onChange={(e) => { const tcs = [...asn.test_cases]; tcs[ti] = { ...tcs[ti], expected_output: e.target.value }; updateAsn(asn.id, "test_cases", tcs); }} style={{ fontSize: 12, fontFamily: "var(--font-mono)" }} />
                              <input className="input" value={tc.description} placeholder="Description" onChange={(e) => { const tcs = [...asn.test_cases]; tcs[ti] = { ...tcs[ti], description: e.target.value }; updateAsn(asn.id, "test_cases", tcs); }} style={{ fontSize: 12 }} />
                              <button onClick={() => { const tcs = asn.test_cases.filter((_, j) => j !== ti); updateAsn(asn.id, "test_cases", tcs); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={13} /></button>
                            </div>
                          ))}
                          <button className="btn-secondary" onClick={() => updateAsn(asn.id, "test_cases", [...asn.test_cases, { input: "", expected_output: "", description: "" }])} style={{ fontSize: 11, padding: "4px 10px" }}><Plus size={11} /> Add Test Case</button>
                        </div>
                      </>
                    )}

                    {/* Quiz-specific fields */}
                    {asn.type === "objective" && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Questions ({asn.questions.length})</label>
                        {asn.questions.map((q, qi) => (
                          <div key={qi} style={{ padding: "12px 14px", background: "var(--bg-tertiary)", borderRadius: 8, marginBottom: 8, border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>Q{qi + 1}</span>
                              <select className="input" value={q.type} onChange={(e) => { const qs = [...asn.questions]; qs[qi] = { ...qs[qi], type: e.target.value }; updateAsn(asn.id, "questions", qs); }} style={{ width: 100, fontSize: 11, padding: "4px 8px" }}>
                                <option value="mcq">MCQ</option><option value="fill_up">Fill Up</option>
                              </select>
                              <div style={{ flex: 1 }} />
                              <button onClick={() => updateAsn(asn.id, "questions", asn.questions.filter((_, j) => j !== qi))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={12} /></button>
                            </div>
                            <input className="input" value={q.question} placeholder="Question text" onChange={(e) => { const qs = [...asn.questions]; qs[qi] = { ...qs[qi], question: e.target.value }; updateAsn(asn.id, "questions", qs); }} style={{ marginBottom: 6, fontSize: 13 }} />
                            {q.type === "mcq" && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                {(q.options || []).map((opt, oi) => (
                                  <div key={oi} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    <input type="radio" name={`q${qi}-correct`} checked={q.correct === oi} onChange={() => { const qs = [...asn.questions]; qs[qi] = { ...qs[qi], correct: oi }; updateAsn(asn.id, "questions", qs); }} />
                                    <input className="input" value={opt} onChange={(e) => { const qs = [...asn.questions]; const opts = [...(qs[qi].options || [])]; opts[oi] = e.target.value; qs[qi] = { ...qs[qi], options: opts }; updateAsn(asn.id, "questions", qs); }} style={{ fontSize: 12, flex: 1 }} />
                                  </div>
                                ))}
                              </div>
                            )}
                            {q.type === "fill_up" && (
                              <input className="input" value={q.answer || ""} placeholder="Correct answer" onChange={(e) => { const qs = [...asn.questions]; qs[qi] = { ...qs[qi], answer: e.target.value }; updateAsn(asn.id, "questions", qs); }} style={{ fontSize: 12, marginTop: 4 }} />
                            )}
                            <input className="input" value={q.explanation} placeholder="Explanation" onChange={(e) => { const qs = [...asn.questions]; qs[qi] = { ...qs[qi], explanation: e.target.value }; updateAsn(asn.id, "questions", qs); }} style={{ fontSize: 12, marginTop: 4 }} />
                          </div>
                        ))}
                        <button className="btn-secondary" onClick={() => updateAsn(asn.id, "questions", [...asn.questions, { type: "mcq", question: "", options: ["", "", "", ""], correct: 0, explanation: "" }])} style={{ fontSize: 11, padding: "4px 10px" }}><Plus size={11} /> Add Question</button>
                      </div>
                    )}

                    {/* IDE-specific fields */}
                    {asn.type === "ide" && (
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Files ({asn.files.length})</label>
                        {asn.files.map((f, fi) => (
                          <div key={fi} style={{ marginBottom: 8, padding: "10px 12px", background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                              <input className="input" value={f.name} placeholder="filename.ext" onChange={(e) => { const fs = [...asn.files]; fs[fi] = { ...fs[fi], name: e.target.value }; updateAsn(asn.id, "files", fs); }} style={{ fontSize: 12, fontFamily: "var(--font-mono)", width: 200 }} />
                              <select className="input" value={f.language} onChange={(e) => { const fs = [...asn.files]; fs[fi] = { ...fs[fi], language: e.target.value }; updateAsn(asn.id, "files", fs); }} style={{ fontSize: 11, width: 120 }}>
                                <option>html</option><option>css</option><option>javascript</option><option>python</option><option>json</option>
                              </select>
                              <div style={{ flex: 1 }} />
                              <button onClick={() => updateAsn(asn.id, "files", asn.files.filter((_, j) => j !== fi))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={12} /></button>
                            </div>
                            <textarea className="input" value={f.content} onChange={(e) => { const fs = [...asn.files]; fs[fi] = { ...fs[fi], content: e.target.value }; updateAsn(asn.id, "files", fs); }} rows={6} style={{ fontFamily: "var(--font-mono)", fontSize: 11, resize: "vertical" }} />
                          </div>
                        ))}
                        <button className="btn-secondary" onClick={() => updateAsn(asn.id, "files", [...asn.files, { name: "new_file.js", content: "", language: "javascript" }])} style={{ fontSize: 11, padding: "4px 10px" }}><Plus size={11} /> Add File</button>
                      </div>
                    )}

                    {/* Rubric (all types) */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Rubric ({asn.rubric.length})</label>
                      {asn.rubric.map((r, ri) => (
                        <div key={ri} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginBottom: 4, alignItems: "center" }}>
                          <input className="input" value={r.criterion} placeholder="Criterion" onChange={(e) => { const rs = [...asn.rubric]; rs[ri] = { ...rs[ri], criterion: e.target.value }; updateAsn(asn.id, "rubric", rs); }} style={{ fontSize: 12 }} />
                          <input className="input" type="number" value={r.weight} placeholder="Weight %" onChange={(e) => { const rs = [...asn.rubric]; rs[ri] = { ...rs[ri], weight: parseInt(e.target.value) || 0 }; updateAsn(asn.id, "rubric", rs); }} style={{ fontSize: 12, width: 80 }} />
                          <button onClick={() => updateAsn(asn.id, "rubric", asn.rubric.filter((_, j) => j !== ri))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={12} /></button>
                        </div>
                      ))}
                      <button className="btn-secondary" onClick={() => updateAsn(asn.id, "rubric", [...asn.rubric, { criterion: "", excellent: "", acceptable: "", poor: "", weight: 50 }])} style={{ fontSize: 11, padding: "4px 10px" }}><Plus size={11} /> Add Criterion</button>
                    </div>

                    {/* Hints */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Hints</label>
                        {(asn.hints || []).map((h, hi) => (
                          <div key={hi} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                            <input className="input" value={h} onChange={(e) => { const hs = [...(asn.hints || [])]; hs[hi] = e.target.value; updateAsn(asn.id, "hints", hs); }} style={{ fontSize: 12, flex: 1 }} />
                            <button onClick={() => updateAsn(asn.id, "hints", (asn.hints || []).filter((_, j) => j !== hi))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={11} /></button>
                          </div>
                        ))}
                        <button className="btn-secondary" onClick={() => updateAsn(asn.id, "hints", [...(asn.hints || []), ""])} style={{ fontSize: 10, padding: "3px 8px" }}><Plus size={10} /> Hint</button>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Pitfalls</label>
                        {(asn.pitfalls || []).map((p, pi) => (
                          <div key={pi} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                            <input className="input" value={p} onChange={(e) => { const ps = [...(asn.pitfalls || [])]; ps[pi] = e.target.value; updateAsn(asn.id, "pitfalls", ps); }} style={{ fontSize: 12, flex: 1 }} />
                            <button onClick={() => updateAsn(asn.id, "pitfalls", (asn.pitfalls || []).filter((_, j) => j !== pi))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={11} /></button>
                          </div>
                        ))}
                        <button className="btn-secondary" onClick={() => updateAsn(asn.id, "pitfalls", [...(asn.pitfalls || []), ""])} style={{ fontSize: 10, padding: "3px 8px" }}><Plus size={10} /> Pitfall</button>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <button className="btn-secondary" onClick={() => handleDeleteAssignment(asn.id)} style={{ padding: "6px 14px", fontSize: 12, color: "var(--danger)" }}>
                        <Trash2 size={13} /> Delete
                      </button>
                      <button className="btn-primary" onClick={() => handleSaveAssignment(asn)} disabled={saving === asn.id} style={{ padding: "6px 14px", fontSize: 12 }}>
                        {saving === asn.id ? <Loader2 size={13} className="animate-pulse-slow" /> : <Save size={13} />}
                        {saving === asn.id ? " Saving..." : " Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
