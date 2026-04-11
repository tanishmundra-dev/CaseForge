const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models to try in order — fallback chain
const MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

async function callLLM(systemPrompt, userMessages, maxTokens = 4000) {
  let lastError = null;

  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens,
          temperature: 0.7,
        },
      });

      // Build contents array for Gemini
      // Gemini uses "user" and "model" roles, system instruction is separate
      // Merge consecutive same-role messages and ensure first message is "user"
      const raw = userMessages.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        text: msg.content,
      }));

      // Merge consecutive same-role messages
      const merged = [];
      for (const r of raw) {
        if (merged.length > 0 && merged[merged.length - 1].role === r.role) {
          merged[merged.length - 1].text += "\n" + r.text;
        } else {
          merged.push({ ...r });
        }
      }

      // Ensure first message is "user"
      if (merged.length > 0 && merged[0].role === "model") {
        merged.shift();
      }
      if (merged.length === 0) {
        merged.push({ role: "user", text: "Hello" });
      }

      const contents = merged.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const result = await model.generateContent({
        contents,
        systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
      });

      const text = result.response.text().trim();
      console.log(`Model ${modelName} succeeded`);
      return text;
    } catch (err) {
      const status = err.status || err.httpStatusCode || "";
      const msg = err.message || "";
      console.log(`Model ${modelName} failed: ${status} ${msg.slice(0, 100)}`);
      lastError = err;

      // If model not found, try next
      if (msg.includes("not found") || msg.includes("not supported") || status === 404) continue;
      // Rate limited, try next
      if (status === 429) continue;
      // Request too large, try next
      if (status === 413) continue;
      // Other errors — still try next model
      continue;
    }
  }

  throw lastError || new Error("All models failed");
}

function safeJSON(text) {
  try { return JSON.parse(text); } catch {}
  // Strip markdown fences
  try {
    const clean = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    return JSON.parse(clean);
  } catch {}
  // Extract first JSON object
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e > s) return JSON.parse(text.slice(s, e + 1));
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════

const CHAT_SYSTEM = `You are a JSON API for a curriculum design chatbot. Respond with ONLY a JSON object.

═══ NO COURSE EXISTS ═══
Gather topic, audience, timeline through friendly conversation.
When ready: {"action":"generate","message":"confirmation text","context":{"topic":"...","audience":"...","timeline":"...","technologies":[],"additional_notes":""}}

═══ COURSE EXISTS (COURSE_CONTEXT provided) ═══
Handle modifications. You MUST return COMPLETE data objects — never empty or partial.

▸ Modify existing content:
{"action":"modify","message":"what changed","level":"meta|week|class|assignment","week":1,"class":1,"assignment_index":0,"data":{COMPLETE object}}

▸ Add a new assignment to a class:
{"action":"modify","message":"what changed","level":"add_assignment","week":1,"class":1,"data":{COMPLETE assignment object}}

═══ ASSIGNMENT SCHEMAS — always use these COMPLETE structures ═══

CODING assignment (type:"coding"):
{"title":"...","description":"3+ sentences","type":"coding","difficulty":"Beginner|Intermediate|Advanced",
 "starter_code":"# Real working starter code\\ndef solve():\\n    pass\\n\\nprint(solve())",
 "test_cases":[{"input":"sample input","expected_output":"expected output","description":"what this tests"}],
 "rubric":[{"criterion":"Correctness","excellent":"...","acceptable":"...","poor":"...","weight":50},{"criterion":"Code Quality","excellent":"...","acceptable":"...","poor":"...","weight":50}],
 "hints":["concrete hint 1","concrete hint 2"],
 "pitfalls":["common mistake 1"],
 "aha_moment":"key insight students should discover",
 "questions":[],"files":[]}

QUIZ/OBJECTIVE assignment (type:"objective"):
{"title":"...","description":"3+ sentences about what this quiz tests","type":"objective","difficulty":"...",
 "questions":[
   {"type":"mcq","question":"Specific technical question?","options":["correct answer","wrong 1","wrong 2","wrong 3"],"correct":0,"explanation":"Why this is correct"},
   {"type":"mcq","question":"Another question?","options":["A","B","C","D"],"correct":2,"explanation":"Explanation"},
   {"type":"fill_up","question":"The ___ keyword is used to...","answer":"correct answer","explanation":"Why"}
 ],
 "rubric":[],"hints":[],"pitfalls":[],"aha_moment":"","starter_code":"","test_cases":[],"files":[]}
IMPORTANT: Quizzes MUST have 5+ questions with real technical content. Each MCQ needs 4 options.

IDE/PROJECT assignment (type:"ide"):
{"title":"...","description":"3+ sentences","type":"ide","difficulty":"...",
 "files":[
   {"name":"index.html","content":"<!DOCTYPE html>\\n<html>...</html>","language":"html"},
   {"name":"style.css","content":"body { ... }","language":"css"},
   {"name":"app.js","content":"// Real working code","language":"javascript"}
 ],
 "rubric":[{"criterion":"Functionality","excellent":"...","acceptable":"...","poor":"...","weight":50}],
 "hints":["hint"],"pitfalls":["pitfall"],"aha_moment":"insight",
 "starter_code":"","test_cases":[],"questions":[]}

═══ CHOOSING ASSIGNMENT TYPES ═══
For tech courses, each class should have a MIX of types:
- "coding" for algorithmic/logic practice (starter code + test cases)
- "objective" for conceptual understanding (MCQ + fill-up questions)
- "ide" for multi-file projects (HTML/CSS/JS, full apps)
When the user asks to "add a quiz" → type:"objective" with 5+ real questions.
When the user asks to "add a coding exercise" → type:"coding" with real starter code.
When the user asks to "add a project" → type:"ide" with real files.

═══ CONVERSATION ═══
{"action":"chat","message":"your friendly response"}

Rules:
- "message" is shown to the user — keep it natural, never show JSON/code/system text in it.
- ALL data objects must be COMPLETE with every field populated with real content.
- NEVER return empty arrays for questions in objective assignments.
- NEVER return placeholder text like "..." or "TODO" — use real, specific content.
- Match the course topic and difficulty when generating content.`;

async function chat(messages, currentCourse) {
  let systemPrompt = CHAT_SYSTEM;

  if (currentCourse) {
    systemPrompt += `\n\nCOURSE_CONTEXT:\n${compactCourse(currentCourse)}`;
  }

  // Build user messages — last 8, truncate assistant messages
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.content.slice(0, 200) : m.content,
    }));

  const tokenLimit = currentCourse ? 8000 : 3000;
  const text = await callLLM(systemPrompt, recent, tokenLimit);
  const parsed = safeJSON(text);
  if (parsed?.action) return parsed;
  if (parsed?.message) return { action: "chat", ...parsed };
  return { action: "chat", message: text.replace(/[{}]/g, "").slice(0, 300).trim() || "Could you rephrase that?" };
}

function compactCourse(c) {
  if (!c?.weeks) return JSON.stringify(c).slice(0, 500);
  return JSON.stringify({
    title: c.title, difficulty: c.difficulty,
    weeks: c.weeks.map((w) => ({
      number: w.number, title: w.title,
      classes: (w.classes || []).map((cl) => ({
        number: cl.number, title: cl.title,
        assignments: (cl.assignments || []).map((a, i) => {
          const info = { index: i, type: a.type, title: a.title, difficulty: a.difficulty };
          if (a.type === "objective") info.question_count = (a.questions || []).length;
          if (a.type === "coding") info.has_starter_code = !!(a.starter_code && a.starter_code.trim());
          if (a.type === "ide") info.file_count = (a.files || []).length;
          return info;
        }),
      })),
    })),
  });
}

// ═══════════════════════════════════════════════════════════
// GENERATE — Two-pass: structure then content per week
// ═══════════════════════════════════════════════════════════

async function generate(context, onProgress) {
  // PASS 1: Generate course outline
  const outlinePrompt = `Create a course outline as JSON.
Topic: ${context.topic} | Audience: ${context.audience} | Duration: ${context.timeline}

Return: {"title":"...","description":"...","difficulty":"...","weeks":[{"number":1,"title":"Week Title","classes":[{"number":1,"title":"Class Title"},{"number":2,"title":"Class Title"}]}]}

Rules:
- EXACTLY ${parseWeekCount(context.timeline)} weeks
- EXACTLY 2 classes per week
- Make titles specific and descriptive
- Difficulty: Beginner/Intermediate/Advanced based on audience`;

  const outlineText = await callLLM(
    "Generate course outlines as JSON. Be specific with titles.",
    [{ role: "user", content: outlinePrompt }],
    1500
  );

  const outline = safeJSON(outlineText);
  if (!outline?.weeks) throw new Error("Failed to generate outline");

  const numWeeks = parseWeekCount(context.timeline);
  while (outline.weeks.length < numWeeks) {
    outline.weeks.push({ number: outline.weeks.length + 1, title: `Advanced Topics ${outline.weeks.length + 1}`, classes: [{ number: 1, title: "Theory" }, { number: 2, title: "Practice" }] });
  }
  outline.weeks = outline.weeks.slice(0, numWeeks);

  if (onProgress) onProgress("outline", outline);

  // PASS 2: Fill content for each week
  for (let i = 0; i < outline.weeks.length; i++) {
    const week = outline.weeks[i];
    const weekPrompt = `Generate detailed content for Week ${week.number}: "${week.title}" of a course on "${outline.title}" for ${context.audience}.

Return JSON: {"classes":[
  {
    "number":1,"title":"${week.classes[0]?.title || 'Class 1'}",
    "description":"Detailed 3-4 sentence description of what students learn",
    "references":[{"title":"Resource","url":"https://real-url","description":"Why useful"}],
    "assignments":[
      {"title":"Coding Exercise","description":"What to build","type":"coding","difficulty":"...","starter_code":"// real starter code with TODOs\\nfunction solve() {}","solution_code":"// complete working solution\\nfunction solve() { return 42; }","test_cases":[{"input":"x","expected_output":"y","description":"test"}],"rubric":[{"criterion":"Correctness","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["hint"],"pitfalls":["pitfall"],"aha_moment":"insight"},
      {"title":"Quiz","description":"Test understanding","type":"objective","difficulty":"...","questions":[{"type":"mcq","question":"Q?","options":["A","B","C","D"],"correct":0,"explanation":"Why"},{"type":"mcq","question":"Q2?","options":["A","B","C","D"],"correct":1,"explanation":"Why"},{"type":"fill_up","question":"The ___ is...","answer":"ans","explanation":"Why"}]}
    ]
  },
  {
    "number":2,"title":"${week.classes[1]?.title || 'Class 2'}",
    "description":"Detailed description",
    "references":[{"title":"Resource","url":"https://real-url","description":"Why"}],
    "assignments":[
      {"title":"Project","description":"Build something","type":"ide","difficulty":"...","files":[{"name":"index.html","content":"<!DOCTYPE html>...","language":"html"},{"name":"app.js","content":"// code","language":"javascript"}],"test_cases":[],"rubric":[{"criterion":"Functionality","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["hint"],"pitfalls":["pitfall"],"aha_moment":"insight"}
    ]
  }
]}

Rules:
- REAL starter code (not placeholders)
- Objective quizzes must have 5+ questions
- Descriptions must be 3+ sentences
- References must use real URLs (MDN, W3Schools, freeCodeCamp, etc)
- Make content progressively harder (this is week ${week.number} of ${numWeeks})`;

    const weekText = await callLLM(
      "Generate detailed course content as JSON. Every field must have real content.",
      [{ role: "user", content: weekPrompt }],
      4096
    );

    const weekData = safeJSON(weekText);
    if (weekData?.classes) {
      outline.weeks[i].classes = weekData.classes.map((cls, ci) => ({
        number: ci + 1,
        title: cls.title || week.classes[ci]?.title || `Class ${ci + 1}`,
        description: cls.description || `Learn about ${cls.title || 'this topic'}.`,
        references: cls.references || [],
        assignments: (cls.assignments || []).map((a) => ({
          title: a.title || "Exercise",
          description: a.description || "Practice exercise",
          type: a.type || "coding",
          difficulty: a.difficulty || "Intermediate",
          starter_code: a.starter_code || "",
          test_cases: a.test_cases || [],
          rubric: a.rubric || [],
          hints: a.hints || [],
          pitfalls: a.pitfalls || [],
          aha_moment: a.aha_moment || "",
          questions: a.questions || [],
          files: a.files || [],
        })),
      }));
    } else {
      outline.weeks[i].classes = (week.classes || []).map((cls, ci) => ({
        number: ci + 1,
        title: cls.title || `Class ${ci + 1}`,
        description: `Hands-on session covering ${cls.title || 'key concepts'}.`,
        references: [],
        assignments: [{
          title: `${cls.title} Exercise`, description: "Practice what you learned.",
          type: "coding", difficulty: "Intermediate",
          starter_code: `// ${cls.title}\nfunction solve() {\n  // TODO\n}\nconsole.log(solve());`,
          test_cases: [], rubric: [], hints: [], pitfalls: [], aha_moment: "", questions: [], files: [],
        }],
      }));
    }

    if (onProgress) onProgress("week", outline.weeks[i]);
  }

  return outline;
}

function parseWeekCount(timeline) {
  const m = (timeline || "4 weeks").match(/(\d+)/);
  return Math.max(1, Math.min(parseInt(m?.[1] || "4"), 12));
}

module.exports = { chat, generate };
