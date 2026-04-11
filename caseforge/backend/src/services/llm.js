const Groq = require("groq-sdk");
require("dotenv").config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
];

async function callLLM(messages, maxTokens = 4000) {
  let lastError = null;
  for (const model of MODELS) {
    try {
      const response = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      });
      return response.choices[0]?.message?.content?.trim() || "{}";
    } catch (err) {
      console.log(`Model ${model} failed: ${err.status || err.message}`);
      lastError = err;
      if (err.status === 429 || err.status === 413) continue;
      throw err;
    }
  }
  throw lastError || new Error("All models rate limited");
}

function safeJSON(text) {
  try { return JSON.parse(text); } catch {}
  try { const s = text.indexOf("{"), e = text.lastIndexOf("}"); if (s !== -1 && e > s) return JSON.parse(text.slice(s, e + 1)); } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════

const CHAT_SYSTEM = `You are a JSON API for a curriculum design chatbot. Respond with ONLY a JSON object.

If no course exists: gather topic, audience, timeline through friendly conversation.
When ready: {"action":"generate","message":"confirmation","context":{"topic":"...","audience":"...","timeline":"...","technologies":[],"additional_notes":""}}

If a course exists (COURSE_CONTEXT): handle modifications.
{"action":"modify","message":"what changed","level":"assignment|class|week|meta","week":1,"class":1,"assignment_index":0,"data":{complete updated object}}

For conversation: {"action":"chat","message":"your friendly response"}

Rules: "message" is shown to the user - keep it natural. Never show JSON/code/system text in it.
Every assignment needs: title, description, type, difficulty.
Every class needs: number, title, description, assignments[], references[].`;

async function chat(messages, currentCourse) {
  const msgs = [{ role: "system", content: CHAT_SYSTEM }];

  if (currentCourse) {
    msgs.push({ role: "system", content: `COURSE_CONTEXT:\n${compactCourse(currentCourse)}` });
  }

  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.role === "assistant" ? m.content.slice(0, 200) : m.content }));
  msgs.push(...recent);

  const text = await callLLM(msgs, 3000);
  const parsed = safeJSON(text);
  if (parsed?.action) return parsed;
  if (parsed?.message) return { action: "chat", ...parsed };
  return { action: "chat", message: "Could you rephrase that?" };
}

function compactCourse(c) {
  if (!c?.weeks) return JSON.stringify(c).slice(0, 400);
  return JSON.stringify({
    title: c.title, difficulty: c.difficulty,
    weeks: c.weeks.map((w) => ({
      number: w.number, title: w.title,
      classes: (w.classes || []).map((cl) => ({
        number: cl.number, title: cl.title,
        assignments: (cl.assignments || []).map((a) => `${a.type}:${a.title}`),
      })),
    })),
  });
}

// ═══════════════════════════════════════════════════════════
// GENERATE — Two-pass: structure then content per week
// ═══════════════════════════════════════════════════════════

async function generate(context, onProgress) {
  // PASS 1: Generate course outline (titles + structure only — small token cost)
  const outlinePrompt = `Create a course outline as JSON.
Topic: ${context.topic} | Audience: ${context.audience} | Duration: ${context.timeline}

Return: {"title":"...","description":"...","difficulty":"...","weeks":[{"number":1,"title":"Week Title","classes":[{"number":1,"title":"Class Title"},{"number":2,"title":"Class Title"}]}]}

Rules:
- EXACTLY ${parseWeekCount(context.timeline)} weeks
- EXACTLY 2 classes per week
- Make titles specific and descriptive
- Difficulty: Beginner/Intermediate/Advanced based on audience`;

  const outlineText = await callLLM([
    { role: "system", content: "Generate course outlines as JSON. Be specific with titles." },
    { role: "user", content: outlinePrompt },
  ], 1000);

  const outline = safeJSON(outlineText);
  if (!outline?.weeks) throw new Error("Failed to generate outline");

  const numWeeks = parseWeekCount(context.timeline);
  // Ensure correct number of weeks
  while (outline.weeks.length < numWeeks) {
    outline.weeks.push({ number: outline.weeks.length + 1, title: `Advanced Topics ${outline.weeks.length + 1}`, classes: [{ number: 1, title: "Theory" }, { number: 2, title: "Practice" }] });
  }
  outline.weeks = outline.weeks.slice(0, numWeeks);

  // Notify progress — outline ready
  if (onProgress) onProgress("outline", outline);

  // PASS 2: Fill content for each week (separate LLM call per week — rich content)
  for (let i = 0; i < outline.weeks.length; i++) {
    const week = outline.weeks[i];
    const weekPrompt = `Generate detailed content for Week ${week.number}: "${week.title}" of a course on "${outline.title}" for ${context.audience}.

Return JSON: {"classes":[
  {
    "number":1,"title":"${week.classes[0]?.title || 'Class 1'}",
    "description":"Detailed 3-4 sentence description of what students learn",
    "references":[{"title":"Resource","url":"https://real-url","description":"Why useful"}],
    "assignments":[
      {"title":"Coding Exercise","description":"What to build","type":"coding","difficulty":"...","starter_code":"// real code\\nfunction solve() {}","test_cases":[{"input":"x","expected_output":"y","description":"test"}],"rubric":[{"criterion":"Correctness","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["hint"],"pitfalls":["pitfall"],"aha_moment":"insight"},
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

    const weekText = await callLLM([
      { role: "system", content: "Generate detailed course content as JSON. Every field must have real content." },
      { role: "user", content: weekPrompt },
    ], 3500);

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
      // Fallback: at least have structure
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
