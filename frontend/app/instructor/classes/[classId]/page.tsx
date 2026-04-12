"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchAPI } from "@/lib/api";
import {
  ArrowLeft, Plus, Trash2, Save, Code, FileText, FolderOpen,
  ChevronDown, ChevronRight, Loader2, Check,
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

interface ClassDetail {
  id: string;
  number: number;
  title: string;
  description: string;
  theory_content?: string;
  week_number: number;
  week_title: string;
  course_id: string;
  course_title: string;
  assignments: Assignment[];
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

      {/* Header */}
      <div className="animate-in animate-in-1" style={{ marginBottom: 32 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          WEEK {cls.week_number} &middot; CLASS {cls.number}
        </span>
        <h1 className="display-heading" style={{ fontSize: 32, marginTop: 8, marginBottom: 8 }}>{cls.title}</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>{cls.description}</p>
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
