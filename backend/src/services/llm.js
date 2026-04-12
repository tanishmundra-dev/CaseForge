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

═══ CHOOSING ASSIGNMENT TYPES (TOPIC-AWARE) ═══
Decide assignment types based on the COURSE TOPIC:

▸ CODING / SOFTWARE / PROGRAMMING courses (e.g. Python, JavaScript, Docker, web dev, data structures, algorithms, DevOps, ML, APIs):
  - MUST include "coding" assignments with real starter_code, test_cases, and rubric
  - Each class should have at least 1 "coding" assignment where students write and run code
  - Can also include "objective" quizzes for conceptual checks and "ide" for multi-file projects
  - "coding" assignments should be the PRIMARY type

▸ NON-CODING courses (e.g. marketing, history, business, design theory, management, finance):
  - Use "objective" assignments (MCQ + fill-up quizzes) as the PRIMARY type
  - Do NOT generate "coding" or "ide" assignments — they make no sense for non-technical topics
  - Each class should have 1-2 "objective" assignments with 5+ real questions each

▸ MIXED courses (e.g. data science, product management, UX with prototyping):
  - Use a mix: "coding" for hands-on technical parts, "objective" for theory/concepts

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

async function chat(messages, currentCourse, fileContent) {
  let systemPrompt = CHAT_SYSTEM;

  if (fileContent) {
    systemPrompt += `\n\n═══ UPLOADED DOCUMENT CONTENT ═══
The user has uploaded a document. Use its content to understand the topic, structure, and key concepts for course creation.
Analyze the document and use it as the basis for generating the course. Extract:
- Main topic and subtopics
- Key concepts and learning objectives
- Suggested audience level based on content complexity
- Natural week/class breakdown based on document sections

DOCUMENT CONTENT:
${fileContent.slice(0, 12000)}`;
  }

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

  const tokenLimit = currentCourse || fileContent ? 8000 : 3000;
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
// FALLBACK STARTER CODE — when LLM skips starter_code
// ═══════════════════════════════════════════════════════════

function generateFallbackStarterCode(title, courseTopic) {
  const topic = (title || "").toLowerCase();
  const course = (courseTopic || "").toLowerCase();

  // Detect language from course/title context
  const isPython = /python|django|flask|pandas|numpy|ml|machine.learn|data/i.test(course + " " + topic);
  const isJS = /javascript|node|express|react|vue|angular|typescript|web|html|css/i.test(course + " " + topic);

  if (isPython) {
    return `# ${title}
# TODO: Implement the solution

def solve():
    """
    Implement your solution here.
    Read the assignment description carefully.
    """
    # Your code here
    result = None
    return result

if __name__ == "__main__":
    output = solve()
    print(f"Result: {output}")
`;
  }

  // Default to JavaScript/Node.js
  return `// ${title}
// TODO: Implement the solution

function solve() {
  /**
   * Implement your solution here.
   * Read the assignment description carefully.
   */
  // Your code here
  let result = null;
  return result;
}

// Test your solution
const output = solve();
console.log("Result:", output);
`;
}

// ═══════════════════════════════════════════════════════════
// GENERATE — Two-pass: structure then content per week
// ═══════════════════════════════════════════════════════════

async function generate(context, onProgress) {
  // PASS 1: Generate course outline
  // Truncate topic if it came from a document (can be very long)
  const topicText = (context.topic || "").length > 500
    ? (context.topic || "").slice(0, 500) + "..."
    : (context.topic || "General course");

  const numWeeks = parseWeekCount(context.timeline);
  const extraNotes = [
    context.technologies?.length ? `Technologies: ${context.technologies.join(", ")}` : "",
    context.additional_notes ? `Notes: ${context.additional_notes}` : "",
  ].filter(Boolean).join("\n");

  const outlinePrompt = `Create a course outline as JSON.
Topic: ${topicText}
Audience: ${context.audience || "General"}
Duration: ${context.timeline || numWeeks + " weeks"}
${extraNotes}

You MUST return ONLY a JSON object with this EXACT structure:
{"title":"Course Title","description":"Course description","difficulty":"Beginner","weeks":[{"number":1,"title":"Week Title","classes":[{"number":1,"title":"Class Title"},{"number":2,"title":"Class Title"}]}]}

Rules:
- EXACTLY ${numWeeks} weeks
- EXACTLY 2 classes per week
- The root object MUST have "title", "description", "difficulty", and "weeks" keys
- Each week MUST have "number", "title", and "classes" keys
- Make titles specific and descriptive
- Difficulty: Beginner/Intermediate/Advanced based on audience`;

  let outline = null;

  // Try up to 2 times for outline generation
  for (let attempt = 0; attempt < 2; attempt++) {
    const outlineText = await callLLM(
      "You are a JSON generator. Return ONLY a valid JSON object with title, description, difficulty, and weeks array. No markdown, no explanation, just the JSON object.",
      [{ role: "user", content: outlinePrompt }],
      2000
    );

    const parsed = safeJSON(outlineText);

    // Handle various response shapes the LLM might return
    if (parsed?.weeks) {
      outline = parsed;
      break;
    }
    // Sometimes LLM wraps in { course: { ... } } or { outline: { ... } }
    const inner = parsed?.course || parsed?.outline || parsed?.data;
    if (inner?.weeks) {
      outline = inner;
      break;
    }
    // If parsed is an array of weeks directly
    if (Array.isArray(parsed) && parsed[0]?.classes) {
      outline = { title: topicText.slice(0, 80), description: "", difficulty: "Intermediate", weeks: parsed };
      break;
    }

    console.log(`Outline attempt ${attempt + 1} failed. LLM returned:`, outlineText?.slice(0, 300));
  }

  if (!outline?.weeks) throw new Error("Failed to generate outline");

  while (outline.weeks.length < numWeeks) {
    outline.weeks.push({ number: outline.weeks.length + 1, title: `Advanced Topics ${outline.weeks.length + 1}`, classes: [{ number: 1, title: "Theory" }, { number: 2, title: "Practice" }] });
  }
  outline.weeks = outline.weeks.slice(0, numWeeks);

  if (onProgress) onProgress("outline", outline);

  // PASS 2: Fill content for each week
  for (let i = 0; i < outline.weeks.length; i++) {
    const week = outline.weeks[i];
    const isCodingCourse = /programming|coding|software|developer|python|javascript|typescript|java|c\+\+|rust|go|ruby|php|swift|kotlin|react|angular|vue|node|docker|kubernetes|devops|api|backend|frontend|fullstack|full.stack|web.dev|data.struct|algorithm|machine.learn|deep.learn|ml|ai|database|sql|git|linux|bash|shell|cloud|aws|azure|gcp|html|css|flask|django|express|spring/i.test(context.topic || outline.title || "");

    const codingExample = `{"title":"Coding Exercise","description":"What to build - 3+ sentences","type":"coding","difficulty":"...","starter_code":"# Real working starter code with TODOs\\ndef solve():\\n    # TODO: implement\\n    pass\\n\\nif __name__ == '__main__':\\n    print(solve())","solution_code":"# complete working solution","test_cases":[{"input":"sample","expected_output":"expected","description":"what this tests"}],"rubric":[{"criterion":"Correctness","excellent":"...","acceptable":"...","poor":"...","weight":50},{"criterion":"Code Quality","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["concrete hint"],"pitfalls":["common mistake"],"aha_moment":"key insight"}`;

    const quizExample = `{"title":"Quiz","description":"Test understanding - 3+ sentences","type":"objective","difficulty":"...","questions":[{"type":"mcq","question":"Q?","options":["A","B","C","D"],"correct":0,"explanation":"Why"},{"type":"mcq","question":"Q2?","options":["A","B","C","D"],"correct":1,"explanation":"Why"},{"type":"mcq","question":"Q3?","options":["A","B","C","D"],"correct":2,"explanation":"Why"},{"type":"mcq","question":"Q4?","options":["A","B","C","D"],"correct":0,"explanation":"Why"},{"type":"fill_up","question":"The ___ is...","answer":"ans","explanation":"Why"}]}`;

    const ideExample = `{"title":"Project","description":"Build something - 3+ sentences","type":"ide","difficulty":"...","files":[{"name":"index.html","content":"<!DOCTYPE html>...","language":"html"},{"name":"app.js","content":"// real code","language":"javascript"}],"test_cases":[],"rubric":[{"criterion":"Functionality","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["hint"],"pitfalls":["pitfall"],"aha_moment":"insight"}`;

    let assignmentGuidance;
    if (isCodingCourse) {
      assignmentGuidance = `This is a CODING/SOFTWARE course. Each class MUST have:
- At least 1 "coding" assignment with REAL starter_code that students can edit and run, with test_cases to validate their solution
- Optionally 1 "objective" quiz for conceptual understanding
- Optionally 1 "ide" project for multi-file exercises
"coding" assignments are the PRIMARY type. Students must be able to write and execute code.

Example assignments for Class 1: [${codingExample}, ${quizExample}]
Example assignments for Class 2: [${codingExample}, ${ideExample}]`;
    } else {
      assignmentGuidance = `This is a NON-CODING course. Each class should have:
- 1-2 "objective" assignments with 5+ real questions each (MCQ + fill-up)
- Do NOT include "coding" or "ide" assignments — they don't apply to this topic

Example assignments: [${quizExample}]`;
    }

    const weekPrompt = `Generate detailed content for Week ${week.number}: "${week.title}" of a course on "${outline.title}" for ${context.audience}.

${assignmentGuidance}

IMPORTANT: Each class MUST include a "theory_content" field — this is the STUDY MATERIAL students read BEFORE attempting assignments. It should be a comprehensive markdown-formatted lesson covering:
- Key concepts explained clearly with examples
- Code snippets or formulas where relevant
- Step-by-step explanations of important processes
- Real-world analogies to make concepts intuitive
- Minimum 300 words per class theory

Return JSON: {"classes":[
  {
    "number":1,"title":"${week.classes[0]?.title || 'Class 1'}",
    "description":"Detailed 3-4 sentence description of what students learn",
    "theory_content":"# Topic Title\\n\\nDetailed lesson content in markdown format. Explain concepts, give examples, include code snippets where relevant.\\n\\n## Subtopic 1\\n\\nExplanation with examples...\\n\\n## Subtopic 2\\n\\nMore content with code blocks:\\n\\n\`\`\`python\\nprint('hello')\\n\`\`\`\\n\\n## Key Takeaways\\n\\n- Point 1\\n- Point 2",
    "references":[{"title":"Resource","url":"https://real-url","description":"Why useful"}],
    "assignments":[... see assignment examples above ...]
  },
  {
    "number":2,"title":"${week.classes[1]?.title || 'Class 2'}",
    "description":"Detailed description",
    "theory_content":"# Another Topic\\n\\nComprehensive lesson content...\\n\\n## Section 1\\n\\nExplanation...\\n\\n## Section 2\\n\\nMore details...",
    "references":[{"title":"Resource","url":"https://real-url","description":"Why"}],
    "assignments":[... see assignment examples above ...]
  }
]}

Rules:
- CRITICAL: "theory_content" is MANDATORY for every class. Students study this BEFORE doing assignments. Write it like a textbook lesson — thorough, clear, with examples and code snippets. Minimum 300 words.
- CRITICAL: "coding" assignments MUST have "starter_code" with 10+ lines of real runnable code. Include function stubs, TODOs, imports, and a main block that prints output. Students CANNOT solve exercises without starter code.
- CRITICAL: "coding" assignments MUST have "test_cases" with at least 2 entries. Each test case needs "input", "expected_output", and "description".
- Objective quizzes must have 5+ questions with real technical content
- Descriptions must be 3+ sentences
- References must use real URLs (MDN, W3Schools, freeCodeCamp, docs, etc)
- Make content progressively harder (this is week ${week.number} of ${numWeeks})
- EVERY field must have real content — no empty strings, no "..." placeholders`;

    const weekText = await callLLM(
      "Generate detailed course content as JSON. CRITICAL: every coding assignment MUST have real starter_code with 10+ lines. Every field must have real content.",
      [{ role: "user", content: weekPrompt }],
      8192
    );

    const weekData = safeJSON(weekText);
    if (weekData?.classes) {
      outline.weeks[i].classes = weekData.classes.map((cls, ci) => ({
        number: ci + 1,
        title: cls.title || week.classes[ci]?.title || `Class ${ci + 1}`,
        description: cls.description || `Learn about ${cls.title || 'this topic'}.`,
        theory_content: cls.theory_content || "",
        references: cls.references || [],
        assignments: (cls.assignments || []).map((a) => {
          const type = a.type || "coding";
          const asn = {
            title: a.title || "Exercise",
            description: a.description || "Practice exercise",
            type,
            difficulty: a.difficulty || "Intermediate",
            starter_code: a.starter_code || "",
            test_cases: a.test_cases || [],
            rubric: a.rubric || [],
            hints: a.hints || [],
            pitfalls: a.pitfalls || [],
            aha_moment: a.aha_moment || "",
            questions: a.questions || [],
            files: a.files || [],
          };

          // Post-processing: ensure coding assignments have starter_code
          if (type === "coding" && !asn.starter_code.trim()) {
            asn.starter_code = generateFallbackStarterCode(asn.title, outline.title);
          }
          // Ensure coding assignments have at least 1 test case
          if (type === "coding" && asn.test_cases.length === 0) {
            asn.test_cases = [
              { input: "", expected_output: "Output:", description: "Should produce output" },
            ];
          }
          // Ensure objective assignments have questions
          if (type === "objective" && asn.questions.length === 0) {
            asn.type = "coding"; // Demote empty quizzes to coding
            asn.starter_code = generateFallbackStarterCode(asn.title, outline.title);
          }
          return asn;
        }),
      }));
    } else {
      outline.weeks[i].classes = (week.classes || []).map((cls, ci) => ({
        number: ci + 1,
        title: cls.title || `Class ${ci + 1}`,
        description: `Hands-on session covering ${cls.title || 'key concepts'}.`,
        theory_content: `# ${cls.title || 'Class ' + (ci + 1)}\n\nThis lesson covers the key concepts of ${cls.title || 'this topic'}. Study the material below before attempting the assignments.\n\n## Overview\n\nContent will be generated when you regenerate this class.`,
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
