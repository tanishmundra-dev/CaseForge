"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import {
  Send, Sparkles, Code, FileText, Pencil, Check, X, Save, Upload,
  ChevronDown, ChevronRight, BookOpen, ExternalLink, Loader2,
} from "lucide-react";

const API = "http://localhost:8000/api";

interface Message { role: "user" | "assistant" | "system"; content: string; }
interface Assignment { title: string; description: string; type: string; difficulty: string; starter_code?: string; hints?: string[]; pitfalls?: string[]; aha_moment?: string; questions?: any[]; files?: any[]; test_cases?: any[]; rubric?: any[]; [k: string]: any; }
interface ClassItem { number: number; title: string; description: string; assignments: Assignment[]; references?: { title: string; url: string; description: string }[]; }
interface Week { number: number; title: string; classes: ClassItem[]; }
interface CourseState { id?: string; title: string; description: string; difficulty: string; weeks: Week[]; status?: string; }

function MissionControlInner() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Welcome to Mission Control. Describe the course you want to create — topic, audience, and duration." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<CourseState | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [saved, setSaved] = useState<"draft" | "published" | null>(null);
  const [saving, setSaving] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [modifiedKey, setModifiedKey] = useState<string | null>(null);
  const [typingText, setTypingText] = useState<string | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);

  const chatEnd = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typingText]);

  // Clear modified highlight after 2s
  useEffect(() => {
    if (modifiedKey) { const t = setTimeout(() => setModifiedKey(null), 2000); return () => clearTimeout(t); }
  }, [modifiedKey]);

  // Auto-save to localStorage
  useEffect(() => {
    if (course) localStorage.setItem("caseforge_draft", JSON.stringify(course));
  }, [course]);

  // Load existing course if ?edit=courseId
  useEffect(() => {
    if (editId) {
      setCourseLoading(true);
      fetchAPI(`/instructor/courses/${editId}`)
        .then((data: any) => {
          if (data && data.weeks) {
            setCourse(data);
            setSaved(data.status === "published" ? "published" : "draft");
            expandAll(data);
            setMessages([
              { role: "assistant", content: `Loaded "${data.title}". You can edit any field by clicking, or ask me to make changes.` },
            ]);
          }
        })
        .catch(() => {})
        .finally(() => setCourseLoading(false));
    } else {
      // Check localStorage for unsaved draft
      const draft = localStorage.getItem("caseforge_draft");
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed?.weeks?.length > 0) {
            setCourse(parsed);
            expandAll(parsed);
            setMessages([
              { role: "assistant", content: `Restored your unsaved draft: "${parsed.title}". Continue editing or ask me to make changes.` },
            ]);
          }
        } catch {}
      }
    }
  }, [editId]);

  function expandAll(c: any) {
    setExpandedWeeks(new Set((c.weeks || []).map((w: any) => w.number)));
    const ck = new Set<string>();
    (c.weeks || []).forEach((w: any) => (w.classes || []).forEach((cl: any) => ck.add(`${w.number}-${cl.number}`)));
    setExpandedClasses(ck);
  }

  /* ══════════════════════════════════════════════
     TYPING ANIMATION — word by word reveal
     ══════════════════════════════════════════════ */
  const animateMessage = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      const words = text.split(" ");
      let i = 0;
      setTypingText("");
      const interval = setInterval(() => {
        i++;
        setTypingText(words.slice(0, i).join(" "));
        if (i >= words.length) {
          clearInterval(interval);
          setTypingText(null);
          setMessages((p) => [...p, { role: "assistant", content: text }]);
          resolve();
        }
      }, 40);
    });
  }, []);

  /* ══════════════════════════════════════════════
     CHAT HANDLER
     ══════════════════════════════════════════════ */
  const handleSend = async () => {
    if (!input.trim() || loading || isStreaming) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    try {
      const chatMsgs = newMsgs
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.role === "assistant" ? m.content.slice(0, 200) : m.content }));

      const result = await fetchAPI("/instructor/mission-control/chat", {
        method: "POST",
        body: JSON.stringify({ messages: chatMsgs, currentCourse: course }),
      });

      const action = result.action || "chat";
      const msg = typeof result.message === "string" ? result.message : "Done.";

      setLoading(false);

      switch (action) {
        case "generate":
          await animateMessage(msg);
          startGeneration(result.context);
          break;
        case "modify":
          applyModification(result);
          await animateMessage(msg);
          break;
        case "chat":
        default:
          await animateMessage(msg);
          break;
      }
    } catch {
      setLoading(false);
      setMessages((p) => [...p, { role: "assistant", content: "Something went wrong. Please try again." }]);
    }
  };

  /* ══════════════════════════════════════════════
     APPLY MODIFICATION — surgical patch
     ══════════════════════════════════════════════ */
  const applyModification = (mod: any) => {
    if (!course || !mod.data) return;
    setSaved(null);

    let level = mod.level;
    if (level === "class" && mod.data.classes) level = "week";
    if (level === "week" && !mod.data.classes && mod.data.assignments) level = "class";

    setCourse((prev) => {
      if (!prev) return prev;
      const u = { ...prev, weeks: prev.weeks.map((w) => ({ ...w, classes: w.classes.map((c) => ({ ...c })) })) };

      switch (level) {
        case "meta":
          if (mod.data.title) u.title = mod.data.title;
          if (mod.data.description) u.description = mod.data.description;
          if (mod.data.difficulty) u.difficulty = mod.data.difficulty;
          setModifiedKey("meta");
          break;
        case "week": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            u.weeks[wi] = { number: mod.week, title: mod.data.title || u.weeks[wi].title, classes: mod.data.classes || u.weeks[wi].classes };
            setModifiedKey(`w-${mod.week}`);
            setExpandedWeeks((p) => new Set([...p, mod.week]));
          }
          break;
        }
        case "class": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const cn = mod.class || mod.data.number;
            const ci = u.weeks[wi].classes.findIndex((c) => c.number === cn);
            if (ci >= 0) {
              u.weeks[wi].classes[ci] = { ...mod.data, number: cn };
              setModifiedKey(`c-${mod.week}-${cn}`);
              setExpandedWeeks((p) => new Set([...p, mod.week]));
              setExpandedClasses((p) => new Set([...p, `${mod.week}-${cn}`]));
            }
          }
          break;
        }
        case "assignment": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const ci = u.weeks[wi].classes.findIndex((c) => c.number === mod.class);
            if (ci >= 0) {
              const ai = mod.assignment_index ?? 0;
              const asns = [...u.weeks[wi].classes[ci].assignments];
              asns[ai] = mod.data;
              u.weeks[wi].classes[ci] = { ...u.weeks[wi].classes[ci], assignments: asns };
              setModifiedKey(`a-${mod.week}-${mod.class}-${ai}`);
              setExpandedWeeks((p) => new Set([...p, mod.week]));
              setExpandedClasses((p) => new Set([...p, `${mod.week}-${mod.class}`]));
            }
          }
          break;
        }
      }
      return u;
    });
  };

  /* ══════════════════════════════════════════════
     SSE STREAMING — initial generation
     ══════════════════════════════════════════════ */
  const startGeneration = async (context: any) => {
    setCourse(null);
    setIsStreaming(true);
    setSaved(null);
    setExpandedWeeks(new Set());
    setExpandedClasses(new Set());

    try {
      const res = await fetch(`${API}/instructor/mission-control/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      if (!reader) throw new Error("No reader");

      let weeks: Week[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let evt = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) evt = line.slice(7).trim();
          else if (line.startsWith("data: ") && evt) {
            try {
              const d = JSON.parse(line.slice(6));
              switch (evt) {
                case "course_meta":
                  setCourse({ title: d.title, description: d.description, difficulty: d.difficulty, weeks: [] });
                  break;
                case "week":
                  weeks = [...weeks, { number: d.number, title: d.title, classes: [] }];
                  setCourse((p) => p ? { ...p, weeks: [...weeks] } : null);
                  setExpandedWeeks((p) => new Set([...p, d.number]));
                  break;
                case "class": {
                  const wi = weeks.findIndex((w) => w.number === d.week);
                  if (wi >= 0) {
                    weeks[wi] = { ...weeks[wi], classes: [...weeks[wi].classes, { number: d.number, title: d.title, description: d.description, assignments: [], references: [] }] };
                    setCourse((p) => p ? { ...p, weeks: [...weeks] } : null);
                    setExpandedClasses((p) => new Set([...p, `${d.week}-${d.number}`]));
                  }
                  break;
                }
                case "assignment": {
                  const wi = weeks.findIndex((w) => w.number === d.week);
                  if (wi >= 0) {
                    const ci = weeks[wi].classes.findIndex((c) => c.number === d.class);
                    if (ci >= 0) {
                      weeks[wi].classes[ci] = { ...weeks[wi].classes[ci], assignments: [...weeks[wi].classes[ci].assignments, d] };
                      setCourse((p) => p ? { ...p, weeks: [...weeks] } : null);
                    }
                  }
                  break;
                }
                case "week_content": {
                  // Pass 2: replace week skeleton with full content
                  const wi = weeks.findIndex((w) => w.number === d.number);
                  if (wi >= 0) {
                    weeks[wi] = d;
                    setCourse((p) => p ? { ...p, weeks: [...weeks] } : null);
                    setExpandedWeeks((p) => new Set([...p, d.number]));
                    for (const cl of d.classes || []) setExpandedClasses((p) => new Set([...p, `${d.number}-${cl.number}`]));
                  }
                  break;
                }
                case "done":
                  if (d.course) {
                    setCourse(d.course);
                    expandAll(d.course);
                  }
                  setIsStreaming(false);
                  await animateMessage("Course generated! Click any text to edit, or tell me what to change.");
                  break;
                case "error":
                  setIsStreaming(false);
                  setMessages((p) => [...p, { role: "assistant", content: d.message }]);
                  break;
              }
            } catch {}
            evt = "";
          }
        }
      }
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Generation failed. Try again." }]);
      setIsStreaming(false);
    }
  };

  /* ══════════════════════════════════════════════
     INLINE EDITING
     ══════════════════════════════════════════════ */
  const startEdit = (f: string, v: string) => { setEditField(f); setEditVal(v); };
  const cancelEdit = () => { setEditField(null); setEditVal(""); };
  const confirmEdit = () => {
    if (!editField || !course) return;
    const [type, ...rest] = editField.split(".");
    setSaved(null);
    setCourse((p) => {
      if (!p) return p;
      const u = { ...p, weeks: p.weeks.map((w) => ({ ...w, classes: w.classes.map((c) => ({ ...c })) })) };
      if (type === "title") u.title = editVal;
      else if (type === "desc") u.description = editVal;
      else if (type === "wt") { const wi = u.weeks.findIndex((w) => w.number === +rest[0]); if (wi >= 0) u.weeks[wi] = { ...u.weeks[wi], title: editVal }; }
      else if (type === "ct" || type === "cd") {
        const [wn, cn] = rest.map(Number);
        const wi = u.weeks.findIndex((w) => w.number === wn);
        if (wi >= 0) { const ci = u.weeks[wi].classes.findIndex((c) => c.number === cn); if (ci >= 0) u.weeks[wi].classes[ci] = { ...u.weeks[wi].classes[ci], [type === "ct" ? "title" : "description"]: editVal }; }
      }
      return u;
    });
    cancelEdit();
  };

  /* ══════════════════════════════════════════════
     SAVE / PUBLISH
     ══════════════════════════════════════════════ */
  const handleSave = async (status: "draft" | "published") => {
    if (!course) return;
    setSaving(true);
    try {
      await fetchAPI("/instructor/mission-control/save", { method: "POST", body: JSON.stringify({ course, status }) });
      setSaved(status);
      localStorage.removeItem("caseforge_draft");
      await animateMessage(status === "published" ? "Published! Trainees can now see this course." : "Saved as draft. You'll find it in the Courses page.");
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Failed to save. Try again." }]);
    } finally { setSaving(false); }
  };

  /* ══════════════════════════════════════════════
     UI HELPERS
     ══════════════════════════════════════════════ */
  const toggleWeek = (n: number) => setExpandedWeeks((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const toggleClass = (k: string) => setExpandedClasses((p) => { const s = new Set(p); s.has(k) ? s.delete(k) : s.add(k); return s; });
  const isModified = (key: string) => modifiedKey === key;

  const Editable = ({ id, val, as: Tag = "span", style, className }: { id: string; val: string; as?: any; style?: React.CSSProperties; className?: string }) => {
    if (editField === id) return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {Tag === "p" || val.length > 100 ? (
          <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)} className="input" autoFocus style={{ fontSize: "inherit", padding: "4px 8px", minHeight: 60, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmEdit(); } if (e.key === "Escape") cancelEdit(); }} />
        ) : (
          <input value={editVal} onChange={(e) => setEditVal(e.target.value)} className="input" autoFocus style={{ fontSize: "inherit", padding: "4px 8px", flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }} />
        )}
        <button onClick={confirmEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--success)", flexShrink: 0 }}><Check size={15} /></button>
        <button onClick={cancelEdit} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", flexShrink: 0 }}><X size={15} /></button>
      </div>
    );
    return <Tag className={className} style={{ ...style, cursor: "pointer" }} onClick={(e: any) => { e.stopPropagation(); startEdit(id, val); }} title="Click to edit">{val}<Pencil size={10} style={{ marginLeft: 4, opacity: 0.2, verticalAlign: "middle" }} /></Tag>;
  };

  const typeIcon = (t: string) => t === "objective" ? <FileText size={12} /> : <Code size={12} />;
  const typeLabel = (t: string) => t === "objective" ? "Quiz" : t === "ide" ? "Project" : "Coding";
  const typeBadge = (t: string) => t === "objective" ? "badge-warning" : t === "ide" ? "badge-accent" : "badge-neutral";
  const glow = (active: boolean) => active ? { boxShadow: "0 0 0 2px var(--accent)", transition: "box-shadow 0.3s" } : { transition: "box-shadow 0.3s" };

  /* ══════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════ */

  if (courseLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 56px)" }}>
      <Loader2 size={32} className="animate-pulse-slow" color="var(--accent)" />
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>
      {/* ═══ LEFT — Course Builder ═══ */}
      <div ref={contentRef} style={{ width: "60%", overflowY: "auto", padding: "28px 36px", background: "var(--bg-primary)" }}>
        {!course ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}><Sparkles size={28} color="var(--accent)" /></div>
            <p style={{ color: "var(--text-tertiary)", fontSize: 15, textAlign: "center", lineHeight: 1.7 }}>Your course will build here in real time.<br />Describe what you want in the chat.</p>
          </div>
        ) : (
          <div style={{ maxWidth: 780, paddingBottom: 60 }}>
            {/* Meta */}
            <div className="animate-in" style={{ marginBottom: 28, borderRadius: 8, padding: isModified("meta") ? 12 : 0, ...glow(isModified("meta")) }}>
              <Editable id="title" val={course.title} as="h1" className="display-heading" style={{ fontSize: 28, marginBottom: 10 }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                <span className="badge badge-neutral">{course.difficulty}</span>
                {isStreaming && <span className="badge badge-accent animate-pulse-slow">GENERATING...</span>}
                {saved && <span className={`badge ${saved === "published" ? "badge-success" : "badge-warning"}`}>{saved.toUpperCase()}</span>}
                {!saved && !isStreaming && course.weeks.length > 0 && <span className="badge badge-danger" style={{ fontSize: 10 }}>UNSAVED</span>}
              </div>
              <Editable id="desc" val={course.description} as="p" style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.7 }} />
            </div>

            {/* Weeks */}
            {course.weeks.map((week) => {
              const wOpen = expandedWeeks.has(week.number);
              return (
                <div key={week.number} className="animate-in" style={{ marginBottom: 20, borderRadius: 8, ...glow(isModified(`w-${week.number}`)) }}>
                  <div onClick={() => toggleWeek(week.number)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer", userSelect: "none" }}>
                    {wOpen ? <ChevronDown size={16} color="var(--accent)" /> : <ChevronRight size={16} color="var(--text-tertiary)" />}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", background: "var(--accent-subtle)", padding: "2px 8px", borderRadius: 4 }}>WEEK {week.number}</span>
                    <Editable id={`wt.${week.number}`} val={week.title} style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--text-heading)" }} />
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{week.classes.length} classes</span>
                  </div>

                  {wOpen && (
                    <div style={{ paddingLeft: 8, marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                      {week.classes.map((cls) => {
                        const cKey = `${week.number}-${cls.number}`;
                        const cOpen = expandedClasses.has(cKey);
                        return (
                          <div key={cKey} className="card animate-in" style={{ padding: 0, overflow: "hidden", ...glow(isModified(`c-${cKey}`)) }}>
                            <div onClick={() => toggleClass(cKey)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", userSelect: "none" }}>
                              {cOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
                              <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--accent)", opacity: 0.35, minWidth: 24 }}>{cls.number}</span>
                              <div style={{ flex: 1 }}><Editable id={`ct.${week.number}.${cls.number}`} val={cls.title} as="h4" style={{ fontSize: 14, fontWeight: 600 }} /></div>
                              <div style={{ display: "flex", gap: 4 }}>
                                {cls.assignments.map((a, i) => <span key={i} className={`badge ${typeBadge(a.type)}`} style={{ fontSize: 10, padding: "2px 6px" }}>{typeLabel(a.type)}</span>)}
                              </div>
                            </div>

                            {cOpen && (
                              <div style={{ borderTop: "1px solid var(--border)", padding: "16px 18px" }}>
                                {/* Description / Lecture Notes */}
                                {cls.description && cls.description.length > 150 ? (
                                  <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                      <BookOpen size={12} color="var(--text-tertiary)" />
                                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Lecture Notes</span>
                                      <Pencil size={10} style={{ marginLeft: "auto", opacity: 0.3, cursor: "pointer" }} onClick={() => startEdit(`cd.${week.number}.${cls.number}`, cls.description)} />
                                    </div>
                                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{cls.description}</p>
                                  </div>
                                ) : (
                                  <Editable id={`cd.${week.number}.${cls.number}`} val={cls.description || ""} as="p" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }} />
                                )}

                                {/* Assignments */}
                                {cls.assignments.map((asn, ai) => (
                                  <div key={ai} style={{ marginBottom: 14, padding: "14px 16px", background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border)", ...glow(isModified(`a-${week.number}-${cls.number}-${ai}`)) }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                      {typeIcon(asn.type)}
                                      <span style={{ fontSize: 13, fontWeight: 600 }}>{asn.title || "Untitled"}</span>
                                      <span className={`badge ${typeBadge(asn.type)}`} style={{ fontSize: 10, padding: "1px 6px", marginLeft: "auto" }}>{asn.difficulty || "—"}</span>
                                    </div>
                                    {asn.description && <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 10 }}>{asn.description}</p>}

                                    {/* Coding: starter code */}
                                    {asn.type === "coding" && asn.starter_code && (
                                      <div style={{ marginBottom: 8 }}>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Starter Code</span>
                                        <pre style={{ marginTop: 4, padding: "10px 12px", background: "#1a1a18", color: "#e8e4df", borderRadius: 6, fontSize: 11, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.5 }}>{asn.starter_code}</pre>
                                      </div>
                                    )}

                                    {/* IDE: files */}
                                    {asn.type === "ide" && asn.files?.map((f: any, fi: number) => (
                                      <div key={fi} style={{ marginBottom: 6 }}>
                                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--accent)", padding: "3px 8px", background: "var(--bg-hover)", borderRadius: "4px 4px 0 0", display: "inline-block" }}>{f.name}</div>
                                        <pre style={{ padding: "8px 12px", background: "#1a1a18", color: "#e8e4df", borderRadius: "0 6px 6px 6px", fontSize: 11, fontFamily: "var(--font-mono)", overflowX: "auto", lineHeight: 1.4, maxHeight: 120 }}>{f.content}</pre>
                                      </div>
                                    ))}

                                    {/* Quiz: questions */}
                                    {asn.type === "objective" && asn.questions?.length > 0 && (
                                      <div>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>{asn.questions.length} Questions</span>
                                        {asn.questions.map((q: any, qi: number) => (
                                          <div key={qi} style={{ marginTop: 4, padding: "6px 10px", background: "var(--bg-secondary)", borderRadius: 4, fontSize: 12, color: "var(--text-secondary)" }}>
                                            <strong>Q{qi + 1}:</strong> {q.question}
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Hints */}
                                    {asn.hints?.length > 0 && (
                                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}><strong>Hints:</strong> {asn.hints.join(" • ")}</p>
                                    )}
                                  </div>
                                ))}

                                {/* References */}
                                {cls.references && cls.references.length > 0 && (
                                  <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--accent-subtle)", borderRadius: 8 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}><BookOpen size={12} color="var(--accent)" /><span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase" }}>References</span></div>
                                    {cls.references.map((ref, ri) => (
                                      <div key={ri} style={{ marginBottom: 4 }}>
                                        <a href={ref.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>{ref.title} <ExternalLink size={9} style={{ verticalAlign: "middle" }} /></a>
                                        {ref.description && <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{ref.description}</p>}
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
                  )}
                </div>
              );
            })}

            {isStreaming && (
              <div className="animate-pulse-slow" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent)", fontSize: 13, fontFamily: "var(--font-mono)", marginTop: 16 }}>
                <Loader2 size={14} /> Building course...
              </div>
            )}

            {course.weeks.length > 0 && !isStreaming && (
              <div className="animate-in" style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button className="btn-secondary" onClick={() => handleSave("draft")} disabled={saving || saved === "draft"} style={{ flex: 1 }}><Save size={14} /> {saved === "draft" ? "Saved as Draft" : "Save Draft"}</button>
                <button className="btn-primary" onClick={() => handleSave("published")} disabled={saving || saved === "published"} style={{ flex: 1 }}><Upload size={14} /> {saving ? "Saving..." : saved === "published" ? "Published" : "Publish"}</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ RIGHT — Chat ═══ */}
      <div style={{ width: "40%", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--bg-secondary)" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--accent-subtle)", display: "flex", alignItems: "center", justifyContent: "center" }}><Sparkles size={15} color="var(--accent)" /></div>
          <div><div style={{ fontSize: 13, fontWeight: 600 }}>CaseForge AI</div><div style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Curriculum Designer</div></div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {messages.map((msg, i) => {
            if (msg.role === "system") return null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{
                  maxWidth: "88%", padding: "9px 13px", fontSize: 13, lineHeight: 1.6,
                  borderRadius: msg.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
                  ...(msg.role === "user" ? { background: "var(--accent)", color: "#fff" } : { background: "var(--bg-tertiary)", color: "var(--text-primary)" }),
                }}>{msg.content}</div>
              </div>
            );
          })}
          {/* Typing animation */}
          {typingText !== null && (
            <div style={{ display: "flex", marginBottom: 12 }}>
              <div style={{ maxWidth: "88%", padding: "9px 13px", fontSize: 13, lineHeight: 1.6, borderRadius: "12px 12px 12px 3px", background: "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                {typingText}<span className="animate-pulse-slow" style={{ opacity: 0.5 }}>|</span>
              </div>
            </div>
          )}
          {loading && typingText === null && (
            <div style={{ display: "flex", marginBottom: 12 }}>
              <div style={{ padding: "9px 13px", borderRadius: "12px 12px 12px 3px", background: "var(--bg-tertiary)", display: "flex", gap: 4, alignItems: "center" }}>
                <span className="animate-pulse-slow" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)" }} />
                <span className="animate-pulse-slow" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animationDelay: "0.2s" }} />
                <span className="animate-pulse-slow" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-tertiary)", animationDelay: "0.4s" }} />
              </div>
            </div>
          )}
          <div ref={chatEnd} />
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <textarea
            className="input" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={course ? "Ask to modify the course..." : "Describe your course..."}
            rows={2} style={{ resize: "none", flex: 1, fontSize: 13 }}
          />
          <button className="btn-primary" onClick={handleSend} disabled={loading || !input.trim() || isStreaming} style={{ padding: "10px 14px", borderRadius: 10, alignSelf: "flex-end" }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MissionControlPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 56px)" }}><Loader2 size={32} className="animate-pulse-slow" color="var(--accent)" /></div>}>
      <MissionControlInner />
    </Suspense>
  );
}
