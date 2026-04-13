"use client";
import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import {
  Send, Sparkles, Code, FileText, Pencil, Check, X, Save, Upload,
  ChevronDown, ChevronRight, BookOpen, ExternalLink, Loader2,
  Paperclip, Plus, Trash2, ArrowUp, ArrowDown, Link2, Video,
} from "lucide-react";

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/;
const extractYouTubeId = (url: string): string | null => {
  if (!url) return null;
  const m = url.match(YOUTUBE_REGEX);
  return m ? m[1] : null;
};

const UNIT_TEMPLATES: Record<string, LearningUnit> = {
  video: { type: "video", title: "New Video", duration: 10, content: "", video_search_query: "" },
  reading: { type: "reading", title: "New Reading", duration: 8, content: "" },
  activity: { type: "activity", title: "New Activity", duration: 15, content: "" },
  quiz: { type: "quiz", title: "Knowledge Check", duration: 5, content: "", questions: [] },
};

const API = "http://localhost:8000/api";

interface Message { role: "user" | "assistant" | "system"; content: string; }
interface Assignment { title: string; description: string; type: string; difficulty: string; starter_code?: string; hints?: string[]; pitfalls?: string[]; aha_moment?: string; questions?: any[]; files?: any[]; test_cases?: any[]; rubric?: any[]; [k: string]: any; }
interface LearningUnit { type: string; title: string; duration?: number; content?: string; completion_type?: string; questions?: unknown[]; video_search_query?: string; video_channel?: string; }
interface ResourceLink { title: string; url?: string; description?: string; type?: string; source?: string; video_search_query?: string; channel?: string; }
interface ClassItem { number: number; title: string; description: string; theory_content?: string; assignments: Assignment[]; references?: { title: string; url: string; description: string }[]; learning_units?: LearningUnit[]; resource_links?: ResourceLink[]; resources?: ResourceLink[]; }
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
  const [expandedTheory, setExpandedTheory] = useState<Set<string>>(new Set());
  const [modifiedKey, setModifiedKey] = useState<string | null>(null);
  const [typingText, setTypingText] = useState<string | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const chatEnd = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typingText]);

  // Clear modified highlight after 2s
  useEffect(() => {
    if (modifiedKey) { const t = setTimeout(() => setModifiedKey(null), 2000); return () => clearTimeout(t); }
  }, [modifiedKey]);

  // Auto-save to localStorage
  useEffect(() => {
    if (course) localStorage.setItem("caseforge_draft", JSON.stringify(course));
  }, [course]);

  // Load existing course or start fresh
  useEffect(() => {
    const isNew = searchParams.get("new") === "true";

    if (isNew) {
      // Fresh session — clear any stored draft
      localStorage.removeItem("caseforge_draft");
      // State is already clean from initial values
    } else if (editId) {
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
      // No params — check localStorage for unsaved draft
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
     FILE UPLOAD HANDLER
     ══════════════════════════════════════════════ */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = "";

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API}/instructor/mission-control/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      setAttachedFile({ name: data.filename, content: data.content });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload file";
      setMessages((p) => [...p, { role: "assistant", content: `File upload failed: ${msg}` }]);
    } finally {
      setUploading(false);
    }
  };

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
    const fileContext = attachedFile;
    const displayText = fileContext
      ? `${input.trim()}\n📎 ${fileContext.name}`
      : input.trim();
    const userMsg: Message = { role: "user", content: displayText };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setAttachedFile(null);
    setLoading(true);

    try {
      const chatMsgs = newMsgs
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.role === "assistant" ? m.content.slice(0, 200) : m.content }));

      const result = await fetchAPI("/instructor/mission-control/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: chatMsgs,
          currentCourse: course,
          fileContent: fileContext?.content || null,
        }),
      });

      const action = result.action || "chat";
      const msg = typeof result.message === "string" ? result.message : "Done.";

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
      setMessages((p) => [...p, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  /* ══════════════════════════════════════════════
     APPLY MODIFICATION — surgical patch
     ══════════════════════════════════════════════ */
  const applyModification = (mod: any) => {
    console.log("MODIFY received:", JSON.stringify({ action: mod.action, level: mod.level, week: mod.week, class: mod.class, assignment_index: mod.assignment_index, hasData: !!mod.data }));
    if (!course) { console.log("MODIFY SKIP: no course"); return; }
    // delete_* levels don't carry data — allow them through
    const isDelete = mod.level === "delete_week" || mod.level === "delete_class";
    if (!mod.data && !isDelete) { console.log("MODIFY SKIP: no data in response"); return; }
    setSaved(null);

    let level = mod.level;
    if (level === "class" && mod.data?.classes) level = "week";
    if (level === "week" && mod.data && !mod.data.classes && mod.data.assignments) level = "class";
    console.log("MODIFY level:", level, "| course weeks:", course.weeks.map((w) => w.number));

    setCourse((prev) => {
      if (!prev) return prev;
      const u = { ...prev, weeks: prev.weeks.map((w) => ({ ...w, classes: w.classes.map((c) => ({ ...c, assignments: [...c.assignments] })) })) };

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
              const existing = u.weeks[wi].classes[ci];
              // Guard: the LLM often sends a "class modify" payload that only
              // touches title/description and omits (or empties) learning_units,
              // theory_content, assignments, resource_links. Spread would wipe
              // real content with nothing — keep existing when incoming is empty.
              const keepIfEmpty = <T,>(incoming: T[] | undefined, current: T[]): T[] =>
                incoming && incoming.length > 0 ? incoming : current;
              u.weeks[wi].classes[ci] = {
                ...existing,
                ...mod.data,
                number: cn,
                theory_content: mod.data.theory_content?.trim()
                  ? mod.data.theory_content
                  : existing.theory_content,
                learning_units: keepIfEmpty(mod.data.learning_units, existing.learning_units || []),
                assignments: keepIfEmpty(mod.data.assignments, existing.assignments || []),
                resource_links: keepIfEmpty(mod.data.resource_links, existing.resource_links || []),
              };
              setModifiedKey(`c-${mod.week}-${cn}`);
              setExpandedWeeks((p) => new Set([...p, mod.week]));
              setExpandedClasses((p) => new Set([...p, `${mod.week}-${cn}`]));
            }
          }
          break;
        }
        case "add_assignment": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const ci = u.weeks[wi].classes.findIndex((c) => c.number === mod.class);
            if (ci >= 0) {
              const newAsn = normalizeAssignment(mod.data);
              u.weeks[wi].classes[ci].assignments.push(newAsn);
              const ai = u.weeks[wi].classes[ci].assignments.length - 1;
              setModifiedKey(`a-${mod.week}-${mod.class}-${ai}`);
              setExpandedWeeks((p) => new Set([...p, mod.week]));
              setExpandedClasses((p) => new Set([...p, `${mod.week}-${mod.class}`]));
              console.log("MODIFY: added new assignment", newAsn.type, newAsn.title, "at index", ai);
            }
          }
          break;
        }
        case "assignment": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const ci = u.weeks[wi].classes.findIndex((c) => c.number === mod.class);
            if (ci >= 0) {
              const asns = u.weeks[wi].classes[ci].assignments;
              let ai = mod.assignment_index ?? -1;
              // Smart match: try index first, then match by type or title
              if (ai < 0 || ai >= asns.length || (mod.data.type && asns[ai]?.type !== mod.data.type)) {
                const typeMatch = asns.findIndex((a) => a.type === mod.data.type);
                if (typeMatch >= 0) ai = typeMatch;
                else {
                  const titleMatch = asns.findIndex((a) => mod.data.title && a.title?.toLowerCase().includes(mod.data.title.toLowerCase().slice(0, 10)));
                  if (titleMatch >= 0) ai = titleMatch;
                  else ai = mod.assignment_index ?? 0;
                }
              }
              // If index still out of range, append instead of silently failing
              if (ai < 0 || ai >= asns.length) {
                asns.push(normalizeAssignment(mod.data));
                ai = asns.length - 1;
              } else {
                asns[ai] = { ...asns[ai], ...normalizeAssignment(mod.data) };
              }
              u.weeks[wi].classes[ci] = { ...u.weeks[wi].classes[ci], assignments: asns };
              setModifiedKey(`a-${mod.week}-${mod.class}-${ai}`);
              setExpandedWeeks((p) => new Set([...p, mod.week]));
              setExpandedClasses((p) => new Set([...p, `${mod.week}-${mod.class}`]));
            }
          }
          break;
        }
        case "add_week": {
          const newWeek: Week = {
            ...mod.data,
            number: u.weeks.length + 1,
            title: mod.data.title || `Week ${u.weeks.length + 1}`,
            classes: (mod.data.classes || []).map((cls: any, i: number) => ({
              ...cls,
              number: i + 1,
              learning_units: cls.learning_units || [],
              assignments: (cls.assignments || []).map((a: any) => normalizeAssignment(a)),
            })),
          };
          u.weeks = [...u.weeks, newWeek];
          setModifiedKey(`w-${newWeek.number}`);
          setExpandedWeeks((p) => new Set([...p, newWeek.number]));
          newWeek.classes.forEach((cl) => {
            setExpandedClasses((p) => new Set([...p, `${newWeek.number}-${cl.number}`]));
          });
          break;
        }
        case "add_class": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const existingClasses = u.weeks[wi].classes;
            const newClass: ClassItem = {
              ...mod.data,
              number: existingClasses.length + 1,
              title: mod.data.title || `Class ${existingClasses.length + 1}`,
              description: mod.data.description || "",
              learning_units: mod.data.learning_units || [],
              assignments: (mod.data.assignments || []).map((a: any) => normalizeAssignment(a)),
            };
            u.weeks[wi] = { ...u.weeks[wi], classes: [...existingClasses, newClass] };
            setModifiedKey(`c-${mod.week}-${newClass.number}`);
            setExpandedWeeks((p) => new Set([...p, mod.week]));
            setExpandedClasses((p) => new Set([...p, `${mod.week}-${newClass.number}`]));
          }
          break;
        }
        case "delete_week": {
          const targetNum = mod.week;
          u.weeks = u.weeks
            .filter((w) => w.number !== targetNum)
            .map((w, i) => ({ ...w, number: i + 1 }));
          setModifiedKey("meta");
          break;
        }
        case "delete_class": {
          const wi = u.weeks.findIndex((w) => w.number === mod.week);
          if (wi >= 0) {
            const targetClassNum = mod.class;
            const remaining = u.weeks[wi].classes
              .filter((c) => c.number !== targetClassNum)
              .map((c, i) => ({ ...c, number: i + 1 }));
            u.weeks[wi] = { ...u.weeks[wi], classes: remaining };
            setModifiedKey(`w-${mod.week}`);
            setExpandedWeeks((p) => new Set([...p, mod.week]));
          }
          break;
        }
      }
      return u;
    });
  };

  const normalizeAssignment = (data: any): Assignment => ({
    title: data.title || "Untitled",
    description: data.description || "",
    type: data.type || "coding",
    difficulty: data.difficulty || "Intermediate",
    starter_code: data.starter_code || "",
    test_cases: data.test_cases || [],
    rubric: data.rubric || [],
    hints: data.hints || [],
    pitfalls: data.pitfalls || [],
    aha_moment: data.aha_moment || "",
    questions: data.questions || [],
    files: data.files || [],
  });

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
      // evt must persist across chunks — TCP can fragment an SSE message between
      // its "event: X\n" and "data: {...}\n" lines, and resetting evt per chunk
      // silently drops the data line (this was why Class 2 never rendered).
      let evt = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) evt = line.slice(7).trim();
          else if (line.startsWith("data: ") && evt) {
            try {
              const d = JSON.parse(line.slice(6));
              switch (evt) {
                case "course_meta":
                  setCourse({ title: d.title, description: d.description, difficulty: d.difficulty, weeks: [] });
                  break;
                case "week": {
                  const newWeek: Week = { number: d.number, title: d.title, classes: [] };
                  weeks = [...weeks, newWeek];
                  setCourse((p) => p ? { ...p, weeks: weeks.map((w) => ({ ...w, classes: [...w.classes] })) } : null);
                  setExpandedWeeks((p) => new Set([...p, d.number]));
                  break;
                }
                case "class": {
                  const wi = weeks.findIndex((w) => w.number === d.week);
                  if (wi >= 0) {
                    // Guard: if the backend ever repeats a class number within a
                    // week, remap it to the next free positional slot so React
                    // keys stay unique and Pass 2 can still address each class.
                    const existingNumbers = new Set(weeks[wi].classes.map((c) => c.number));
                    let num = d.number;
                    if (num == null || existingNumbers.has(num)) {
                      num = weeks[wi].classes.length + 1;
                      while (existingNumbers.has(num)) num++;
                    }
                    const newClass: ClassItem = { number: num, title: d.title, description: d.description, assignments: [], references: [] };
                    weeks = weeks.map((w, i) => i === wi ? { ...w, classes: [...w.classes, newClass] } : w);
                    setCourse((p) => p ? { ...p, weeks: weeks.map((w) => ({ ...w, classes: [...w.classes] })) } : null);
                    setExpandedClasses((p) => new Set([...p, `${d.week}-${num}`]));
                  }
                  break;
                }
                case "assignment": {
                  const wi = weeks.findIndex((w) => w.number === d.week);
                  if (wi >= 0) {
                    const ci = weeks[wi].classes.findIndex((c) => c.number === d.class);
                    if (ci >= 0) {
                      weeks = weeks.map((w, i) => i === wi ? {
                        ...w,
                        classes: w.classes.map((c, j) => j === ci ? { ...c, assignments: [...c.assignments, d] } : c),
                      } : w);
                      setCourse((p) => p ? { ...p, weeks: weeks.map((w) => ({ ...w, classes: [...w.classes] })) } : null);
                    }
                  }
                  break;
                }
                case "week_content": {
                  // Legacy: replace week skeleton with full content (single payload)
                  const wi = weeks.findIndex((w) => w.number === d.number);
                  if (wi >= 0) {
                    const replaced: Week = { ...d, classes: [...(d.classes || [])] };
                    weeks = weeks.map((w, i) => i === wi ? replaced : w);
                    setCourse((p) => p ? { ...p, weeks: weeks.map((w) => ({ ...w, classes: [...w.classes] })) } : null);
                    setExpandedWeeks((p) => new Set([...p, d.number]));
                    for (const cl of d.classes || []) setExpandedClasses((p) => new Set([...p, `${d.number}-${cl.number}`]));
                  }
                  break;
                }
                case "week_content_class": {
                  // Pass 2: receive one class at a time (avoids large payload drops).
                  const wcWi = weeks.findIndex((w) => w.number === d.week);
                  if (wcWi >= 0 && d.classData) {
                    const classNum = d.classData.number;
                    const newClassData: ClassItem = { ...d.classData };
                    weeks = weeks.map((w, i) => {
                      if (i !== wcWi) return w;
                      const existingCi = w.classes.findIndex((c) => c.number === classNum);
                      const nextClasses = existingCi >= 0
                        ? w.classes.map((c, j) => j === existingCi ? newClassData : c)
                        : [...w.classes, newClassData];
                      return { ...w, classes: nextClasses };
                    });
                    setCourse((p) => p ? { ...p, weeks: weeks.map((w) => ({ ...w, classes: [...w.classes] })) } : null);
                    setExpandedWeeks((p) => new Set([...p, d.week]));
                    setExpandedClasses((p) => new Set([...p, `${d.week}-${classNum}`]));
                  }
                  break;
                }
                case "week_content_done": {
                  // Signal that all classes for this week have been sent
                  setExpandedWeeks((p) => new Set([...p, d.number]));
                  break;
                }
                case "done":
                  setIsStreaming(false);
                  if (d.course) {
                    // Log unit counts per class — if any class shows 0 here but
                    // backend logs said it "got N units", the SSE payload was
                    // truncated or the backend merge mis-assigned it.
                    const summary = (d.course.weeks || []).map((w: Week) =>
                      `W${w.number}: [${(w.classes || []).map((c) => `C${c.number}=${(c as ClassItem).learning_units?.length ?? 0}u`).join(", ")}]`
                    ).join(" | ");
                    console.log("[SSE done] unit counts:", summary);
                    // Deep-clone via JSON round-trip to break ALL shared references
                    // from incremental SSE updates. Without this, React may reuse
                    // cached child renders for classes whose arrays still point at
                    // the mutated closure object, leaving Class 2 visibly empty.
                    const freshCourse = JSON.parse(JSON.stringify(d.course));
                    weeks = freshCourse.weeks || [];
                    setCourse(freshCourse);
                    expandAll(freshCourse);
                  }
                  // Show critic feedback if available
                  const critic = d.course?._critic;
                  if (critic && critic.verdict) {
                    const criticMsg = `Course generated! Quality: ${critic.overall_score || "?"}/10 — ${critic.verdict}${critic.suggestions?.length ? "\n\nSuggestions: " + critic.suggestions.join(" | ") : ""}`;
                    await animateMessage(criticMsg);
                  } else {
                    await animateMessage("Course generated! Click any text to edit, or tell me what to change.");
                  }
                  break;
                case "error":
                  setIsStreaming(false);
                  setMessages((p) => [...p, { role: "assistant", content: d.message }]);
                  break;
              }
            } catch (err) {
              // Silent parse failures mask real bugs (e.g., class 2 never showing
              // up because its SSE data line was truncated). Log loudly.
              const preview = line.length > 120 ? line.slice(0, 60) + "...(" + line.length + " chars)..." + line.slice(-40) : line;
              console.error(`[SSE] parse failed for event="${evt}":`, err instanceof Error ? err.message : err, "| line preview:", preview);
            }
            evt = "";
          }
        }
      }
    } catch {
      setMessages((p) => [...p, { role: "assistant", content: "Generation failed. Try again." }]);
    } finally {
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
      // Learning unit fields: lu-<field>.<weekNum>.<classNum>.<unitIndex>
      // field ∈ { title, content, duration, type }
      else if (type.startsWith("lu-")) {
        const field = type.slice(3); // "title" | "content" | "duration" | "type"
        const [wn, cn, uiStr] = rest;
        const wi = u.weeks.findIndex((w) => w.number === +wn);
        if (wi >= 0) {
          const ci = u.weeks[wi].classes.findIndex((c) => c.number === +cn);
          if (ci >= 0) {
            const units = [...(u.weeks[wi].classes[ci].learning_units || [])];
            const unitIdx = +uiStr;
            if (units[unitIdx]) {
              const value: string | number =
                field === "duration" ? (parseInt(editVal, 10) || 0) : editVal;
              units[unitIdx] = { ...units[unitIdx], [field]: value };
              u.weeks[wi].classes[ci] = { ...u.weeks[wi].classes[ci], learning_units: units };
            }
          }
        }
      }
      return u;
    });
    cancelEdit();
  };

  /* ══════════════════════════════════════════════
     DIRECT MUTATIONS — learning units & resources
     ══════════════════════════════════════════════ */
  const mutateClass = (weekNum: number, classNum: number, fn: (c: ClassItem) => ClassItem) => {
    setSaved(null);
    setCourse((p) => {
      if (!p) return p;
      return {
        ...p,
        weeks: p.weeks.map((w) => w.number !== weekNum ? w : {
          ...w,
          classes: w.classes.map((c) => c.number !== classNum ? c : fn({ ...c })),
        }),
      };
    });
  };

  const patchUnit = (weekNum: number, classNum: number, idx: number, patch: Partial<LearningUnit>) => {
    mutateClass(weekNum, classNum, (c) => {
      const units = [...(c.learning_units || [])];
      if (units[idx]) units[idx] = { ...units[idx], ...patch };
      return { ...c, learning_units: units };
    });
  };

  const addUnit = (weekNum: number, classNum: number, type: string) => {
    mutateClass(weekNum, classNum, (c) => ({
      ...c,
      learning_units: [...(c.learning_units || []), { ...UNIT_TEMPLATES[type] }],
    }));
    setExpandedTheory((p) => new Set([...p, `${weekNum}-${classNum}`]));
  };

  const deleteUnit = (weekNum: number, classNum: number, idx: number) => {
    if (!confirm("Delete this learning unit?")) return;
    mutateClass(weekNum, classNum, (c) => ({
      ...c,
      learning_units: (c.learning_units || []).filter((_, i) => i !== idx),
    }));
  };

  const moveUnit = (weekNum: number, classNum: number, idx: number, dir: -1 | 1) => {
    mutateClass(weekNum, classNum, (c) => {
      const units = [...(c.learning_units || [])];
      const target = idx + dir;
      if (target < 0 || target >= units.length) return c;
      [units[idx], units[target]] = [units[target], units[idx]];
      return { ...c, learning_units: units };
    });
  };

  const patchResource = (weekNum: number, classNum: number, idx: number, patch: Partial<ResourceLink>) => {
    mutateClass(weekNum, classNum, (c) => {
      const list = [...(c.resource_links || c.resources || [])];
      if (list[idx]) list[idx] = { ...list[idx], ...patch };
      return { ...c, resource_links: list };
    });
  };

  const addResource = (weekNum: number, classNum: number) => {
    mutateClass(weekNum, classNum, (c) => ({
      ...c,
      resource_links: [...(c.resource_links || c.resources || []), { type: "article", title: "New Resource", url: "" }],
    }));
  };

  const deleteResource = (weekNum: number, classNum: number, idx: number) => {
    if (!confirm("Delete this resource?")) return;
    mutateClass(weekNum, classNum, (c) => ({
      ...c,
      resource_links: (c.resource_links || c.resources || []).filter((_, i) => i !== idx),
    }));
  };

  const patchMeta = (patch: Partial<CourseState>) => {
    setSaved(null);
    setCourse((p) => p ? { ...p, ...patch } : p);
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

  const UnitPreview = ({ unit, index, weekNumber, classNumber, unitIcons, unitColors, totalUnits }: { unit: any; index: number; weekNumber: number; classNumber: number; unitIcons: Record<string, string>; unitColors: Record<string, string>; totalUnits: number }) => {
    const [open, setOpen] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    const titleFieldId = `lu-title.${weekNumber}.${classNumber}.${index}`;
    const durationFieldId = `lu-duration.${weekNumber}.${classNumber}.${index}`;
    const contentFieldId = `lu-content.${weekNumber}.${classNumber}.${index}`;
    const isEditingContent = editField === contentFieldId;
    const videoUrl: string = unit.video_url || "";
    const ytId = extractYouTubeId(videoUrl);
    const urlInvalid = videoUrl.trim() && !ytId;
    return (
      <div style={{ borderBottom: "1px solid var(--border)" }}>
        <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", cursor: "pointer", background: open ? "var(--bg-secondary)" : "var(--bg-primary)" }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: (unitColors[unit.type] || "var(--text-tertiary)") + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>
            {unitIcons[unit.type] || "•"}
          </span>
          <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            <Editable id={titleFieldId} val={unit.title || ""} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-heading)" }} />
          </div>
          <select
            value={unit.type || "video"}
            onChange={(e) => patchUnit(weekNumber, classNumber, index, { type: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 4px", color: "var(--text-tertiary)", cursor: "pointer" }}
          >
            <option value="video">video</option>
            <option value="reading">reading</option>
            <option value="activity">activity</option>
            <option value="quiz">quiz</option>
          </select>
          <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
            <Editable id={durationFieldId} val={String(unit.duration ?? "")} style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }} />
            <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>m</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); moveUnit(weekNumber, classNumber, index, -1); }}
            disabled={index === 0}
            title="Move up"
            style={{ background: "none", border: "none", cursor: index === 0 ? "not-allowed" : "pointer", color: "var(--text-tertiary)", padding: 2, opacity: index === 0 ? 0.3 : 1 }}
          >
            <ArrowUp size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); moveUnit(weekNumber, classNumber, index, 1); }}
            disabled={index === totalUnits - 1}
            title="Move down"
            style={{ background: "none", border: "none", cursor: index === totalUnits - 1 ? "not-allowed" : "pointer", color: "var(--text-tertiary)", padding: 2, opacity: index === totalUnits - 1 ? 0.3 : 1 }}
          >
            <ArrowDown size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); deleteUnit(weekNumber, classNumber, index); }}
            title="Delete unit"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger, #dc2626)", padding: 2 }}
          >
            <Trash2 size={11} />
          </button>
          {open ? <ChevronDown size={12} color="var(--text-tertiary)" /> : <ChevronRight size={12} color="var(--text-tertiary)" />}
        </div>
        {open && isEditingContent && (
          <div style={{ padding: "12px 16px 12px 50px", background: "var(--bg-secondary)" }} onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              className="input"
              autoFocus
              style={{ width: "100%", minHeight: 240, fontSize: 12, fontFamily: "var(--font-mono)", padding: 10, lineHeight: 1.6 }}
              onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={confirmEdit} className="btn" style={{ fontSize: 11, padding: "4px 10px", background: "var(--success)", color: "#fff" }}>Save (Ctrl+Enter)</button>
              <button onClick={cancelEdit} className="btn" style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</button>
            </div>
          </div>
        )}
        {open && !isEditingContent && (
          <div style={{ padding: "12px 16px 12px 50px", background: "var(--bg-secondary)", maxHeight: 300, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(contentFieldId, unit.content || ""); }}
                className="btn"
                style={{ fontSize: 10, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                title="Edit content"
              >
                <Pencil size={10} /> Edit content
              </button>
            </div>
            {!unit.content && (
              <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic", marginBottom: 8 }}>
                No content yet — click &ldquo;Edit content&rdquo; above to add some.
              </div>
            )}
            <div
              style={{ fontSize: 12, lineHeight: 1.7, color: "var(--text-secondary)" }}
              dangerouslySetInnerHTML={{ __html: (unit.content || "")
                .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#1a1a18;color:#e8e4df;padding:10px;border-radius:6px;font-size:11px;font-family:var(--font-mono);overflow-x:auto;margin:6px 0;line-height:1.4"><code>$2</code></pre>')
                .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-size:11px;font-family:var(--font-mono)">$1</code>')
                .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:12px 0 4px;color:var(--text-heading)">$1</h4>')
                .replace(/^## (.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:16px 0 6px;color:var(--text-heading)">$1</h3>')
                .replace(/^# (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;margin:0 0 8px;color:var(--accent)">$1</h2>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^- (.+)$/gm, '<li style="margin:2px 0">$1</li>')
                .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:4px 0 4px 16px;list-style:disc">$1</ul>')
                .replace(/\n\n/g, '<br/><br/>')
              }}
            />
            {unit.type === "video" && (
              <div style={{ marginTop: 12, padding: 10, background: "var(--bg-tertiary)", borderRadius: 6, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Video size={12} color="#DC2626" />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>YouTube</span>
                  {videoUrl && !urlInvalid && (
                    <button
                      onClick={() => setShowPreview((s) => !s)}
                      className="btn"
                      style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px" }}
                    >
                      {showPreview ? "Hide preview" : "Show preview"}
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <Link2 size={11} color="var(--text-tertiary)" />
                  <input
                    type="url"
                    className="input"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={videoUrl}
                    onChange={(e) => patchUnit(weekNumber, classNumber, index, { video_url: e.target.value } as Partial<LearningUnit>)}
                    style={{ flex: 1, fontSize: 11, padding: "4px 8px", fontFamily: "var(--font-mono)" }}
                  />
                  {videoUrl && !urlInvalid && (
                    <a href={videoUrl} target="_blank" rel="noreferrer" title="Open in YouTube" style={{ color: "var(--text-tertiary)", display: "flex" }}>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                {urlInvalid && (
                  <div style={{ fontSize: 10, color: "var(--danger, #dc2626)", marginBottom: 6 }}>
                    Not a valid YouTube URL (expected youtube.com/watch?v=... or youtu.be/...)
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: "var(--text-tertiary)", minWidth: 50 }}>Channel:</span>
                  <input
                    type="text"
                    className="input"
                    placeholder="Channel name"
                    value={unit.video_channel || ""}
                    onChange={(e) => patchUnit(weekNumber, classNumber, index, { video_channel: e.target.value } as Partial<LearningUnit>)}
                    style={{ flex: 1, fontSize: 11, padding: "4px 8px" }}
                  />
                </div>
                {ytId && showPreview && (
                  <div style={{ marginTop: 8, position: "relative", width: "100%", paddingBottom: "56.25%", height: 0, borderRadius: 6, overflow: "hidden", background: "#000" }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}`}
                      title="YouTube preview"
                      allowFullScreen
                      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
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
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={course.difficulty}
                  onChange={(e) => patchMeta({ difficulty: e.target.value })}
                  className="input"
                  style={{ fontSize: 11, padding: "2px 6px", height: 22, width: "auto", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                  title="Change difficulty"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
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
                                {Array.from(new Set(cls.assignments.map((a) => a.type))).map((t) => <span key={t} className={`badge ${typeBadge(t)}`} style={{ fontSize: 10, padding: "2px 6px" }}>{typeLabel(t)}</span>)}
                              </div>
                            </div>

                            {cOpen && (
                              <div style={{ borderTop: "1px solid var(--border)", padding: "16px 18px" }}>
                                {/* Description / Lecture Notes */}
                                {(() => {
                                  const fieldId = `cd.${week.number}.${cls.number}`;
                                  const isEditing = editField === fieldId;
                                  const isLong = (cls.description || "").length > 150;
                                  if (isLong || isEditing) {
                                    return (
                                      <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 8, border: `1px solid ${isEditing ? "var(--accent)" : "var(--border)"}` }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                          <BookOpen size={12} color="var(--text-tertiary)" />
                                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase" }}>Lecture Notes</span>
                                          {!isEditing && (
                                            <button
                                              className="btn"
                                              onClick={() => startEdit(fieldId, cls.description || "")}
                                              style={{ marginLeft: "auto", fontSize: 10, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                                              title="Edit lecture notes"
                                            >
                                              <Pencil size={10} /> Edit
                                            </button>
                                          )}
                                        </div>
                                        {isEditing ? (
                                          <>
                                            <textarea
                                              className="input"
                                              value={editVal}
                                              onChange={(e) => setEditVal(e.target.value)}
                                              autoFocus
                                              rows={10}
                                              style={{ width: "100%", fontSize: 13, lineHeight: 1.7, padding: "10px 12px", resize: "vertical", fontFamily: "inherit" }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); confirmEdit(); }
                                                if (e.key === "Escape") cancelEdit();
                                              }}
                                            />
                                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                              <button onClick={confirmEdit} className="btn" style={{ fontSize: 11, padding: "4px 10px", background: "var(--success)", color: "#fff" }}>
                                                <Check size={11} /> Save (Ctrl+Enter)
                                              </button>
                                              <button onClick={cancelEdit} className="btn" style={{ fontSize: 11, padding: "4px 10px" }}>
                                                <X size={11} /> Cancel
                                              </button>
                                            </div>
                                          </>
                                        ) : (
                                          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "pointer" }} onClick={() => startEdit(fieldId, cls.description || "")} title="Click to edit">{cls.description}</p>
                                        )}
                                      </div>
                                    );
                                  }
                                  return <Editable id={fieldId} val={cls.description || ""} as="p" style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }} />;
                                })()}

                                {/* Learning Units (Coursera-style) */}
                                {cls.learning_units && cls.learning_units.length > 0 ? (() => {
                                  const tKey = `${week.number}-${cls.number}`;
                                  const tOpen = expandedTheory.has(tKey);
                                  const unitIcons: Record<string, string> = { video: "▶", reading: "📖", activity: "🔧", quiz: "✓" };
                                  const unitColors: Record<string, string> = { video: "#DC2626", reading: "var(--accent)", activity: "#16A34A", quiz: "#7C3AED" };
                                  const totalMins = cls.learning_units.reduce((s: number, u: any) => s + (u.duration || 0), 0);
                                  return (
                                  <div style={{ marginBottom: 14 }}>
                                    <div
                                      onClick={() => setExpandedTheory((p) => { const s = new Set(p); s.has(tKey) ? s.delete(tKey) : s.add(tKey); return s; })}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--accent-subtle)", borderRadius: tOpen ? "8px 8px 0 0" : 8, border: "1px solid rgba(217,119,6,0.15)", cursor: "pointer", userSelect: "none" }}
                                    >
                                      {tOpen ? <ChevronDown size={13} color="var(--accent)" /> : <ChevronRight size={13} color="var(--accent)" />}
                                      <BookOpen size={13} color="var(--accent)" />
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", flex: 1 }}>Learning Units</span>
                                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{cls.learning_units.length} units &middot; {totalMins} min</span>
                                    </div>
                                    {tOpen && (
                                      <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                                        {cls.learning_units.map((unit: any, ui: number) => (
                                          <UnitPreview key={ui} unit={unit} index={ui} weekNumber={week.number} classNumber={cls.number} unitIcons={unitIcons} unitColors={unitColors} totalUnits={cls.learning_units!.length} />
                                        ))}
                                        <div style={{ display: "flex", gap: 6, padding: "8px 10px", background: "var(--bg-secondary)", flexWrap: "wrap" }}>
                                          {(["video","reading","activity","quiz"] as const).map((t) => (
                                            <button
                                              key={t}
                                              className="btn"
                                              onClick={() => addUnit(week.number, cls.number, t)}
                                              style={{ fontSize: 10, padding: "4px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                                            >
                                              <Plus size={10} /> {unitIcons[t]} {t}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  );
                                })() : cls.theory_content && cls.theory_content.trim() ? (() => {
                                  /* Fallback: old-style theory_content blob */
                                  const tKey = `${week.number}-${cls.number}-legacy`;
                                  const tOpen = expandedTheory.has(tKey);
                                  return (
                                  <div style={{ marginBottom: 14 }}>
                                    <div
                                      onClick={() => setExpandedTheory((p) => { const s = new Set(p); s.has(tKey) ? s.delete(tKey) : s.add(tKey); return s; })}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--bg-secondary)", borderRadius: tOpen ? "8px 8px 0 0" : 8, border: "1px solid var(--border)", cursor: "pointer", userSelect: "none" }}
                                    >
                                      {tOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} color="var(--text-tertiary)" />}
                                      <BookOpen size={13} color="var(--text-tertiary)" />
                                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", flex: 1 }}>Study Material (Legacy)</span>
                                      <span style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{Math.round(cls.theory_content.length / 5)} words</span>
                                    </div>
                                    {tOpen && (
                                      <div style={{ padding: "16px 20px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", maxHeight: 500, overflowY: "auto" }}>
                                        <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{cls.theory_content.slice(0, 2000)}{cls.theory_content.length > 2000 ? "\n\n..." : ""}</div>
                                      </div>
                                    )}
                                  </div>
                                  );
                                })() : null}

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
                                    {asn.type === "objective" && (asn.questions?.length ?? 0) > 0 && asn.questions && (
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
                                    {(asn.hints?.length ?? 0) > 0 && asn.hints && (
                                      <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 6 }}><strong>Hints:</strong> {asn.hints.join(" • ")}</p>
                                    )}
                                  </div>
                                ))}

                                {/* Resources (editable) */}
                                {(() => {
                                  const resources = cls.resource_links || cls.resources || [];
                                  return (
                                    <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--accent-subtle)", borderRadius: 8 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                        <BookOpen size={12} color="var(--accent)" />
                                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", flex: 1 }}>Resources &amp; References</span>
                                        <button
                                          className="btn"
                                          onClick={() => addResource(week.number, cls.number)}
                                          style={{ fontSize: 10, padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}
                                        >
                                          <Plus size={10} /> Add
                                        </button>
                                      </div>
                                      {resources.length === 0 ? (
                                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic" }}>No resources yet — click &ldquo;Add&rdquo; to attach one.</div>
                                      ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                          {resources.map((ref: ResourceLink, ri: number) => (
                                            <div key={ri} style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 8px", background: "var(--bg-primary)", borderRadius: 6, border: "1px solid var(--border)" }}>
                                              <select
                                                value={ref.type || "article"}
                                                onChange={(e) => patchResource(week.number, cls.number, ri, { type: e.target.value })}
                                                style={{ fontSize: 10, padding: "2px 4px", background: "var(--bg-tertiary)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                                              >
                                                <option value="article">article</option>
                                                <option value="video">video</option>
                                                <option value="docs">docs</option>
                                                <option value="other">other</option>
                                              </select>
                                              <input
                                                className="input"
                                                placeholder="Title"
                                                value={ref.title || ""}
                                                onChange={(e) => patchResource(week.number, cls.number, ri, { title: e.target.value })}
                                                style={{ flex: 1, fontSize: 11, padding: "3px 6px" }}
                                              />
                                              <input
                                                className="input"
                                                type="url"
                                                placeholder="https://..."
                                                value={ref.url || ""}
                                                onChange={(e) => patchResource(week.number, cls.number, ri, { url: e.target.value })}
                                                style={{ flex: 2, fontSize: 11, padding: "3px 6px", fontFamily: "var(--font-mono)" }}
                                              />
                                              {ref.url && (
                                                <a href={ref.url} target="_blank" rel="noreferrer" title="Open" style={{ color: "var(--text-tertiary)", display: "flex" }}>
                                                  <ExternalLink size={11} />
                                                </a>
                                              )}
                                              <button
                                                onClick={() => deleteResource(week.number, cls.number, ri)}
                                                title="Delete resource"
                                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger, #dc2626)", padding: 2 }}
                                              >
                                                <Trash2 size={11} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
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

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          {/* Attached file badge */}
          {attachedFile && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 10px", background: "var(--accent-subtle)", borderRadius: 6, fontSize: 12 }}>
              <Paperclip size={12} color="var(--accent)" />
              <span style={{ color: "var(--accent)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, display: "flex" }}><X size={14} /></button>
            </div>
          )}
          {uploading && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "6px 10px", background: "var(--bg-tertiary)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)" }}>
              <Loader2 size={12} className="animate-pulse-slow" /> Extracting text from file...
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.txt,.md"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || isStreaming}
              title="Attach a file (PDF, DOCX, PPTX, TXT)"
              style={{
                background: "none", border: "1px solid var(--border)", borderRadius: 10,
                padding: "10px 12px", cursor: uploading ? "wait" : "pointer", alignSelf: "flex-end",
                color: attachedFile ? "var(--accent)" : "var(--text-tertiary)",
                transition: "color 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = attachedFile ? "var(--accent)" : "var(--text-tertiary)"; }}
            >
              <Paperclip size={16} />
            </button>
            <textarea
              className="input" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={attachedFile ? "Describe the course to create from this file..." : course ? "Ask to modify the course..." : "Describe your course..."}
              rows={2} style={{ resize: "none", flex: 1, fontSize: 13 }}
            />
            <button className="btn-primary" onClick={handleSend} disabled={loading || !input.trim() || isStreaming} style={{ padding: "10px 14px", borderRadius: 10, alignSelf: "flex-end" }}>
              <Send size={16} />
            </button>
          </div>
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
