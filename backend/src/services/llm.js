const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models to try in order — fallback chain
const MODELS = [
  "gemini-3.1-pro-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

async function callLLM(systemPrompt, userMessages, maxTokens = 8000) {
  let lastError = null;

  for (const modelName of MODELS) {
    // Per-model retry loop: allows us to back off on 429 against the SAME
    // model (rate limits are transient) before falling through to the next.
    const MAX_429_RETRIES = 2;
    let retry429 = 0;

    while (true) {
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
        if (!text) {
          // Empty response — likely hit safety filter or maxTokens cutoff.
          // Throw so the outer retry loop (generateClassUnits) gets another shot.
          throw new Error(`Model ${modelName} returned empty response`);
        }
        console.log(`Model ${modelName} succeeded`);
        return text;
      } catch (err) {
        const status = err.status || err.httpStatusCode || "";
        const msg = err.message || "";
        console.log(`Model ${modelName} failed: ${status} ${msg.slice(0, 100)}`);
        lastError = err;

        // Rate limited: back off and retry the SAME model up to MAX_429_RETRIES
        // before falling through. Rate limits are usually brief and the next
        // model isn't necessarily better.
        const isRateLimit = status === 429 || /429|rate/i.test(msg);
        if (isRateLimit && retry429 < MAX_429_RETRIES) {
          retry429++;
          const delay = 3000 + Math.random() * 2000; // 3-5 seconds
          console.log(`Rate limited on ${modelName}, waiting ${Math.round(delay / 1000)}s (attempt ${retry429}/${MAX_429_RETRIES})...`);
          await new Promise((r) => setTimeout(r, delay));
          continue; // retry same model
        }

        // All other failure modes (404 model not found, 413 too large,
        // exhausted 429 retries, anything else) → fall through to next model.
        break;
      }
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
// CHAT — two focused prompts (gather vs modify) instead of one
// mega-prompt. Gemini performs better with shorter, single-purpose
// system instructions.
// ═══════════════════════════════════════════════════════════

// Mode A: no course yet — gather requirements through conversation.
const GATHER_SYSTEM = `You are a world-class curriculum architect. You help instructors design courses through friendly conversation.

Your job right now: gather requirements. Ask about:
- Topic and specific technologies
- Target audience and their current skill level
- Desired outcomes (job-ready? certification? hobby?)
- Timeline (how many weeks, classes per week)
- Any domain focus (fintech, healthcare, gaming)

Keep responses concise and friendly. Ask ONE question at a time.
When you have enough info, confirm briefly and signal readiness to generate.

Respond ONLY as JSON — no markdown, no prose outside the JSON.

While still gathering:
{"action":"chat","message":"your friendly response"}

When you have enough info to generate the course:
{"action":"generate","message":"short confirmation to the user","context":{"topic":"...","audience":"...","timeline":"4 weeks","technologies":[],"additional_notes":"","domain":""}}

Rules:
- "message" is shown to the user — natural, conversational, no JSON jargon
- Never skip gathering — do not set action="generate" until topic + audience + timeline are all known`;

// Mode B: a course exists — refine it surgically.
// IMPORTANT: field shape (level / 1-based week / 1-based class / 0-based
// assignment_index) is fixed by the frontend consumer at
// frontend/app/instructor/mission-control/page.tsx. Do not rename.
const MODIFY_SYSTEM = `You are refining an existing course. The current course is provided under COURSE_CONTEXT.

### RULES
- Only modify what the instructor asked for — nothing else
- Return the COMPLETE modified object at the level being changed
- Maintain the course's difficulty progression and voice
- Do NOT regenerate the entire course
- Do NOT return empty arrays or placeholder strings — every field must have real content
- When the user asks to ADD a new week or class, use level "add_week" or "add_class" — do NOT use level "meta" to just rename the course
- When adding a week, the "data" must contain COMPLETE classes with assignments — not empty arrays
- The "number" field for a new week should be the next sequential number (if course has 2 weeks, new week is number 3)
- When the user asks to REMOVE/DELETE a week or class, use level "delete_week" or "delete_class" — never silently drop via "meta"
- When adding a week or class, learning_units MUST contain 6-10 complete units with real content — NEVER return empty learning_units arrays
- Every learning unit must have duration > 0 and content with real text (500+ words for video/reading)
- If the request would make the response too long, include at least 4 units with full content and note in the message that the instructor should ask for more units to be added

### RESPONSE FORMATS (JSON only, no markdown)

Modify course meta (title/description/difficulty):
{"action":"modify","message":"what changed","level":"meta","data":{"title":"...","description":"...","difficulty":"..."}}

Modify a week (week numbers are 1-based, matching COURSE_CONTEXT):
{"action":"modify","message":"what changed","level":"week","week":1,"data":{COMPLETE week object with title and classes[]}}

Modify a class (week and class are 1-based) — learning_units MUST have real content:
{"action":"modify","message":"what changed","level":"class","week":1,"class":2,"data":{"number":2,"title":"Class Title","description":"3-4 sentences","learning_units":[6-10 COMPLETE units with type, title, duration, content — see LEARNING UNIT SCHEMAS below],"assignments":[]}}

Modify an assignment (assignment_index is 0-based within the class):
{"action":"modify","message":"what changed","level":"assignment","week":1,"class":2,"assignment_index":0,"data":{COMPLETE assignment object}}

Add an assignment to a class:
{"action":"modify","message":"what was added","level":"add_assignment","week":1,"class":2,"data":{COMPLETE assignment object}}

Add a new week to the course (classes MUST have complete learning_units with real content — never empty):
{"action":"modify","message":"what was added","level":"add_week","data":{"number":3,"title":"Week Title","classes":[{"number":1,"title":"Class Title","description":"3-4 sentence description of what this class covers","learning_units":[{"type":"video","title":"...","duration":12,"content":"500+ word lecture content...","completion_type":"auto","video_search_query":"..."},{"type":"reading","title":"...","duration":15,"content":"800+ word deep dive...","completion_type":"auto"},{"type":"quiz","title":"...","duration":5,"content":"...","completion_type":"graded","questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]},{"type":"graded_assignment","title":"...","duration":45,"content":"...","completion_type":"graded","starter_code":"...","solution_code":"...","test_cases":[...],"rubric":[...]}],"assignments":[]}]}}

Add a new class to an existing week (week is 1-based):
{"action":"modify","message":"what was added","level":"add_class","week":2,"data":{"number":3,"title":"Class Title","description":"...","learning_units":[],"assignments":[{COMPLETE assignment object}]}}

Delete a week:
{"action":"modify","message":"what was removed","level":"delete_week","week":3}

Delete a class from a week:
{"action":"modify","message":"what was removed","level":"delete_class","week":2,"class":3}

Pure conversation (clarifying questions, no change yet):
{"action":"chat","message":"your response"}

### LEARNING UNIT SCHEMAS (every class must have 6-10 of these)

VIDEO unit:
{"type":"video","title":"Why This Matters","duration":12,"content":"FULL detailed explanation in markdown, minimum 500 words. Start with why this matters. Use analogies. Include step-by-step walkthroughs. This is NOT a placeholder — write the actual lecture content.","completion_type":"auto","video_search_query":"specific YouTube search query 5-10 words e.g. 'Python Docker containerize flask app tutorial 2024'","video_channel":"Recommended channel e.g. 'Traversy Media'"}

READING unit:
{"type":"reading","title":"Deep Dive: Core Concept","duration":15,"content":"FULL markdown content, minimum 800 words. Use ## headers, code blocks, bullet points, 💡 Pro Tips, ⚠️ Common Mistakes, 🎯 Key Insights. This must be a comprehensive reference the student can revisit.","completion_type":"auto"}

ACTIVITY unit:
{"type":"activity","title":"Hands-On: Try It Yourself","duration":10,"content":"Step-by-step instructions for what the student should do. Be specific: 'Open your terminal and type...' or 'Create a new file called...' 100-200 words.","completion_type":"manual"}

QUIZ unit (inline reinforcement, 3-5 questions):
{"type":"quiz","title":"Check Your Understanding","duration":5,"content":"Test your understanding of the concepts just covered.","completion_type":"graded","questions":[{"type":"mcq","question":"What is X?","options":["A","B","C","D"],"correct":0,"explanation":"A is correct because..."},{"type":"fill_up","question":"The ___ is used to...","answer":"keyword","explanation":"Because..."}]}

CHECKPOINT CODING unit (short 5-10 min exercise between concepts):
{"type":"checkpoint_coding","title":"Try It: Quick Exercise","duration":8,"content":"Instructions for the exercise","completion_type":"graded","starter_code":"# 5-8 lines with ONE clear TODO\ndef solve(x):\n    # TODO: implement\n    pass\n\nprint(solve(5))","solution_code":"# Complete working solution\ndef solve(x):\n    return x * 2\n\nprint(solve(5))","test_cases":[{"input":"5","expected_output":"10","description":"basic case"}]}

GRADED ASSIGNMENT unit (full 30-60 min assessment, only at END of class):
{"type":"graded_assignment","title":"Full Assignment Name","duration":45,"content":"Detailed assignment description and instructions","completion_type":"graded","starter_code":"# 10+ lines real code with TODOs","solution_code":"# Complete working solution","test_cases":[{"input":"...","expected_output":"...","description":"..."},{"input":"...","expected_output":"...","description":"edge case"}],"rubric":[{"criterion":"...","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["hint 1"],"pitfalls":["specific mistake"],"aha_moment":"key insight"}

### LEARNING UNIT RULES
- EVERY unit MUST have "type", "title", "duration" (in minutes, never 0), and "content" (real text, not empty)
- "content" is the MAIN field — this is what the student reads/watches. It must be SUBSTANTIAL:
  - video: 500+ words of actual lecture content
  - reading: 800+ words with markdown formatting, headers, code blocks
  - activity: 100-200 words of specific instructions
  - quiz: can be short, but must have "questions" array with 3+ questions
  - checkpoint_coding: instructions + starter_code + solution_code + test_cases
  - graded_assignment: full instructions + starter_code + solution_code + test_cases + rubric
- NEVER return a learning unit with empty "content" or "duration": 0
- Structure pattern: video/reading → quiz/checkpoint → video/reading → checkpoint_coding → reading (summary) → graded_assignment
- Never put 3 passive units (video/reading) in a row without an interactive unit between them

### ASSIGNMENT SCHEMAS

CODING (type:"coding"):
{"title":"...","description":"...","type":"coding","difficulty":"Beginner|Intermediate|Advanced","starter_code":"10+ lines of real code with TODOs","solution_code":"complete working solution","test_cases":[{"input":"actual value","expected_output":"actual value","description":"what this tests"}],"rubric":[{"criterion":"...","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["progressive hint 1","more specific hint 2"],"pitfalls":["specific mistake"],"aha_moment":"key insight","questions":[],"files":[]}

QUIZ (type:"objective"):
{"title":"...","description":"...","type":"objective","difficulty":"...","questions":[{"type":"mcq","question":"...","options":[{"id":"a","text":"Option A text"},{"id":"b","text":"Option B text"},{"id":"c","text":"Option C text"},{"id":"d","text":"Option D text"}],"correct_id":"b","explanation":"..."},{"type":"fill_up","question":"The ___ is...","answer":"...","explanation":"..."}],"rubric":[],"hints":[],"pitfalls":[],"aha_moment":"","starter_code":"","test_cases":[],"files":[]}

IDE (type:"ide"):
{"title":"...","description":"...","type":"ide","difficulty":"...","files":[{"name":"...","content":"...","language":"..."}],"rubric":[{"criterion":"...","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["..."],"pitfalls":["..."],"aha_moment":"...","starter_code":"","test_cases":[],"questions":[]}

### MCQ SCHEMA NOTE
- MCQ "options" is an array of {id, text} objects (stable IDs survive reordering)
- "correct_id" references the id of the correct option (e.g. "b"), NOT a numeric index
- This is the canonical shape — do not emit the legacy {options:["A","B"], correct:0} form

### QUALITY BAR
- Coding: real starter_code (10+ lines with structure + TODOs), complete solution_code, 3+ test_cases including edge cases, rubric weights sum to 100
- Quiz: 4+ questions, at least 3 different question types when possible, every question has an explanation
- Pitfalls must be SPECIFIC ("Forgetting to close the DB connection"), not generic ("Not handling errors")
- Aha moments must be GENUINE INSIGHTS that change how the student thinks, not restated objectives
- test_cases input/expected_output must be actual values the function would receive and return`;

async function chat(messages, currentCourse, fileContent) {
  // Pick the focused prompt for the current mode.
  let systemPrompt = currentCourse ? MODIFY_SYSTEM : GATHER_SYSTEM;

  if (fileContent) {
    systemPrompt += `\n\n═══ UPLOADED DOCUMENT CONTENT ═══
The user has uploaded a document. Use its content to understand the topic, structure, and key concepts for course creation.
Analyze the document and use it as the basis for generating the course. Extract:
- Main topic and subtopics
- Key concepts and learning objectives
- Suggested audience level based on content complexity
- Natural week/class breakdown based on document sections

DOCUMENT CONTENT:
${fileContent.slice(0, 20000)}`;
  }

  if (currentCourse) {
    // Send compact overview + full detail of the likely edit target.
    // The compact view lists every class but strips content; the target detail
    // gives the LLM the actual question/code it needs to edit.
    const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    const targetDetail = extractEditTarget(currentCourse, lastUserMsg);

    let courseContext = compactCourse(currentCourse);
    if (targetDetail) {
      courseContext += `\n\n_TARGET_DETAIL (full content of the section being discussed):\n${JSON.stringify(targetDetail, null, 2).slice(0, 6000)}`;
    }

    systemPrompt += `\n\nCOURSE_CONTEXT:\n${courseContext}`;
  }

  // Build user messages — last 8, truncate assistant messages
  const recent = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-8)
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.content.slice(0, 200) : m.content,
    }));

  // Adding a week/class demands enough headroom for 6-10 learning units with
  // full content per class — bump the cap when we detect that intent.
  const lastMsg = (messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "").toLowerCase();
  const isAddingContent = /add.*week|add.*class|add.*unit|add.*learning|generate.*content|fill.*content/.test(lastMsg);
  const tokenLimit = isAddingContent ? 32000 : (currentCourse || fileContent ? 16000 : 4000);
  const text = await callLLM(systemPrompt, recent, tokenLimit);
  const parsed = safeJSON(text);
  if (parsed?.action) return parsed;
  if (parsed?.message) return { action: "chat", ...parsed };
  // Parse failed entirely — never leak raw JSON-looking text into the chat UI.
  // Fall back to a clean prompt asking the user to rephrase.
  return { action: "chat", message: "Could you rephrase that?" };
}

// Figure out which class/assignment/week the user is talking about so we can
// ship its full content to the MODIFY prompt (compactCourse drops detail).
function extractEditTarget(course, userMessage) {
  if (!course?.weeks) return null;
  const msg = (userMessage || "").toLowerCase();
  if (!msg) return null;

  for (const week of course.weeks) {
    for (const cls of (week.classes || [])) {
      const classTitle = (cls.title || "").toLowerCase().trim();
      const classRef = `class ${cls.number}`;
      const titleHit = classTitle && classTitle.length > 3 && msg.includes(classTitle);

      if (titleHit || msg.includes(classRef)) {
        // Does the user mention a specific assignment within this class?
        const assignments = cls.assignments || [];
        for (let ai = 0; ai < assignments.length; ai++) {
          const asgn = assignments[ai];
          const asgnTitle = (asgn.title || "").toLowerCase().trim();
          const asgnHit = asgnTitle && asgnTitle.length > 3 && msg.includes(asgnTitle);
          if (asgnHit || msg.includes(`assignment ${ai + 1}`)) {
            return { _type: "assignment", week: week.number, class: cls.number, assignment_index: ai, data: asgn };
          }
        }
        return { _type: "class", week: week.number, class: cls.number, data: cls };
      }
    }
  }

  // Fall back to week-level references
  for (const week of course.weeks) {
    const weekTitle = (week.title || "").toLowerCase().trim();
    if (msg.includes(`week ${week.number}`) || (weekTitle.length > 3 && msg.includes(weekTitle))) {
      return { _type: "week", week: week.number, data: week };
    }
  }

  return null;
}

function compactCourse(c) {
  if (!c?.weeks) return JSON.stringify(c).slice(0, 500);
  const compact = JSON.stringify({
    title: c.title, difficulty: c.difficulty,
    total_weeks: c.weeks.length,
    weeks: c.weeks.map((w) => ({
      number: w.number, title: w.title,
      total_classes: (w.classes || []).length,
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
  // Safety cap to avoid bloating the system prompt for large courses
  if (compact.length > 8000) return compact.slice(0, 8000) + '..."}}';
  return compact;
}

// ═══════════════════════════════════════════════════════════
// FALLBACK STARTER CODE — when LLM skips starter_code
// ═══════════════════════════════════════════════════════════

function generateFallbackStarterCode(title, courseTopic) {
  const topic = (title || "").toLowerCase();
  const course = (courseTopic || "").toLowerCase();

  // Detect language from course/title context
  const isPython = /python|django|flask|pandas|numpy|ml|machine.learn|data/i.test(course + " " + topic);

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
// LEARNING UNIT POST-PROCESSING
// Assignments live INSIDE learning_units now (see FIX 1). This normalizer
// fills missing required fields for each unit type, normalizes MCQ shape,
// and tags interactivity for the frontend.
// ═══════════════════════════════════════════════════════════

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const letters = ["a", "b", "c", "d", "e", "f"];
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;

    // Only MCQ questions use options/correct
    const isMCQ = q.type === "mcq" || (!q.type && Array.isArray(q.options));
    if (!isMCQ) return q;

    // Convert string options → {id, text} objects
    if (Array.isArray(q.options) && q.options.length > 0 && typeof q.options[0] === "string") {
      q.options = q.options.map((text, i) => ({ id: letters[i] || `o${i}`, text }));
    }

    // Convert numeric correct → correct_id
    if (typeof q.correct === "number" && !q.correct_id) {
      q.correct_id = letters[q.correct] || "a";
    }

    return q;
  });
}

function postProcessLearningUnits(units, courseTitle) {
  return (units || []).map((unit) => {
    // Ensure checkpoint_coding has starter code + solution
    if (unit.type === "checkpoint_coding") {
      if (!unit.starter_code || !unit.starter_code.trim()) {
        unit.starter_code = generateFallbackStarterCode(unit.title, courseTitle);
      }
      unit.solution_code = unit.solution_code || unit.starter_code;
      unit.test_cases = unit.test_cases || [];
      unit.completion_type = "graded";
    }

    // Ensure graded_assignment has all required fields
    if (unit.type === "graded_assignment") {
      if (!unit.starter_code || !unit.starter_code.trim()) {
        unit.starter_code = generateFallbackStarterCode(unit.title, courseTitle);
      }
      unit.solution_code = unit.solution_code || "";
      unit.test_cases = unit.test_cases || [];
      unit.rubric = unit.rubric || [];
      unit.hints = unit.hints || [];
      unit.pitfalls = unit.pitfalls || [];
      unit.aha_moment = unit.aha_moment || "";
      unit.completion_type = "graded";
    }

    // Quiz types need questions — demote to activity if the LLM skipped them
    if (unit.type === "quiz" || unit.type === "checkpoint_quiz") {
      if (!unit.questions || unit.questions.length === 0) {
        unit.type = "activity";
        unit.completion_type = "manual";
      } else {
        unit.completion_type = "graded";
      }
    }

    // Normalize any MCQ questions (quiz, checkpoint_quiz, or a graded_assignment
    // that happens to include questions) to the stable {id,text} + correct_id shape
    if (unit.questions && unit.questions.length > 0) {
      unit.questions = normalizeQuestions(unit.questions);
    }

    // Tag interactivity for frontend rendering decisions
    unit.is_interactive = [
      "quiz", "checkpoint_quiz", "checkpoint_coding",
      "graded_assignment", "activity",
    ].includes(unit.type);

    // Base field defaults
    unit.title = unit.title || "Untitled Unit";
    unit.duration = unit.duration || 10;
    unit.content = unit.content || "";
    unit.completion_type = unit.completion_type || "auto";

    return unit;
  });
}

// Warn (don't block) when the interleaving pattern is violated — too many
// passive units in a row, not enough interactivity, or no graded capstone.
function validateInterleaving(units, weekNum, classNum) {
  const warnings = [];
  let passiveStreak = 0;

  for (let i = 0; i < units.length; i++) {
    const isPassive = units[i].type === "video" || units[i].type === "reading";
    if (isPassive) {
      passiveStreak++;
      if (passiveStreak >= 3) {
        warnings.push(`3+ passive units in a row at position ${i - 2} to ${i}`);
      }
    } else {
      passiveStreak = 0;
    }
  }

  const interactive = units.filter((u) => u.is_interactive).length;
  const ratio = units.length > 0 ? interactive / units.length : 0;
  if (ratio < 0.25) {
    warnings.push(`Only ${Math.round(ratio * 100)}% interactive units (target: 30%+)`);
  }

  if (!units.some((u) => u.type === "graded_assignment")) {
    warnings.push("No graded_assignment at end of class");
  }

  if (warnings.length > 0) {
    console.warn(`⚠ Week ${weekNum} Class ${classNum} interleaving issues:`, warnings.join("; "));
  }
  return warnings;
}

// ═══════════════════════════════════════════════════════════
// LEARNING UNITS PROMPT — split into system (stable) + user (specific)
// so the bulk of the schema gets cached / prompt-evaluated once per call
// with less chance of Gemini "skimming" the end of a mega-prompt.
// ═══════════════════════════════════════════════════════════

function buildUnitsSystemPrompt(isCodingCourse) {
  const codingFlavor = isCodingCourse
    ? "This is a CODING/SOFTWARE course. Checkpoint/graded units MUST be real runnable code exercises with starter_code and test_cases. Every reading unit should include 6+ runnable code blocks."
    : "This is a NON-CODING course. Prefer checkpoint_quiz over checkpoint_coding. Replace code blocks with case studies, decision frameworks, and real-world examples.";

  return `You are a Coursera/Udemy-level course platform designer. You structure each class as a sequence of individually completable Learning Units that interleave passive learning (video/reading) with active practice (checkpoints, activities, assessments).

${codingFlavor}

### UNIT TYPES
- "video": Concept intro / storytelling / walkthrough. content = detailed transcript (500+ words). completion_type: "auto". Include "video_search_query" (5-10 word YouTube search) and "video_channel" (real channel name). NEVER fabricate YouTube URLs.
- "reading": Structured reference / deep-dive. content = comprehensive markdown (800+ words) with headers, 💡 Pro Tips, ⚠️ Common Mistakes, 🎯 Key Insights. completion_type: "auto".
- "activity": Open-ended hands-on task (no auto-grading). content = short actionable instructions (100-200 words). completion_type: "manual".
- "checkpoint_quiz": SHORT 2-3 question quiz testing the concept JUST taught in the previous unit. MUST include "questions" array. Graded instantly. duration: 3-5 min. completion_type: "graded".
- "checkpoint_coding": SHORT coding exercise (5-10 min) testing ONE concept just taught. MUST include "starter_code" (5-8 lines with one TODO), "test_cases" (2-3 simple cases), "solution_code" (complete). duration: 5-10 min. completion_type: "graded".
- "graded_assignment": FULL coding/project assignment (30-60 min) at the END of the class only. MUST include "starter_code" (10+ lines), "test_cases" (3+ with edge cases), "rubric" (weights summing to 100), "solution_code" (complete working), "hints", "pitfalls", "aha_moment". duration: 30-60 min. completion_type: "graded".

### STRUCTURE PATTERN (MUST follow)
1. video or reading — introduce concept A
2. checkpoint_quiz OR checkpoint_coding — practice concept A immediately
3. video or reading — introduce concept B
4. checkpoint_coding OR activity — practice concept B immediately
5. video or reading — deepen understanding, connect A + B
6. checkpoint_quiz — test combined understanding
7. reading — summary and what is next
8. graded_assignment — full assessment combining everything from this class

CRITICAL RULE: Never place more than 2 passive units (video/reading) in a row without an interactive unit between them. Students must DO something every 10-15 minutes.

Total class duration 60-120 minutes. No single unit over 60 minutes.

### MCQ QUESTION SHAPE (for checkpoint_quiz)
Each MCQ uses stable IDs so option reordering can't break the answer key:
{"question":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correct_id":"b","explanation":"..."}
Fill-up format: {"type":"fill_up","question":"The ___ is used to...","answer":"keyword","explanation":"..."}

### CONTENT QUALITY BAR ($150 paid course)
- video content = detailed transcript, starts with "Why does this matter?", uses analogies, real examples
- reading content = structured markdown, genuine insights, not filler
- NO "In this section..." padding. Every sentence teaches something.
- Pitfalls and aha_moments MUST be specific and non-obvious

### RETURN FORMAT (JSON ONLY)
{
  "description": "3-4 sentence class description — what transformation happens",
  "learning_units": [
    { "type":"video", "title":"...", "duration":12, "content":"...", "completion_type":"auto", "video_search_query":"...", "video_channel":"..." },
    { "type":"checkpoint_quiz", "title":"Check: concept A", "duration":4, "content":"Test what you just learned.", "completion_type":"graded",
      "questions":[
        {"type":"mcq","question":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correct_id":"b","explanation":"..."},
        {"type":"fill_up","question":"The ___ is...","answer":"...","explanation":"..."}
      ]
    },
    { "type":"reading", "title":"...", "duration":15, "content":"# Heading\\n\\n...", "completion_type":"auto" },
    { "type":"checkpoint_coding", "title":"Try It", "duration":8, "content":"Instructions", "completion_type":"graded",
      "starter_code":"# 5-8 lines with one TODO", "solution_code":"# complete", "test_cases":[{"input":"...","expected_output":"...","description":"..."}]
    },
    { "type":"reading", "title":"Summary & What's Next", "duration":8, "content":"...", "completion_type":"auto" },
    { "type":"graded_assignment", "title":"...", "duration":45, "content":"Full assignment description", "completion_type":"graded",
      "starter_code":"# 10+ lines with TODOs", "solution_code":"# complete working solution",
      "test_cases":[{"input":"...","expected_output":"...","description":"..."},{"input":"...","expected_output":"...","description":"edge case"},{"input":"...","expected_output":"...","description":"another edge"}],
      "rubric":[{"criterion":"Correctness","excellent":"...","acceptable":"...","poor":"...","weight":50},{"criterion":"Code Quality","excellent":"...","acceptable":"...","poor":"...","weight":50}],
      "hints":["..."], "pitfalls":["..."], "aha_moment":"..."
    }
  ]
}

Return ONLY the JSON object — no markdown fences, no prose.`;
}

function buildUnitsUserPrompt(weekNum, weekTitle, classNum, classTitle, outline, context, numWeeks) {
  const phase = weekNum <= Math.ceil(numWeeks / 3)
    ? "FOUNDATIONS — Build intuition from zero. Assume no prior knowledge."
    : weekNum <= Math.ceil(numWeeks * 2 / 3)
      ? "INTERMEDIATE — Apply to real-world scenarios. Introduce complexity and trade-offs."
      : "ADVANCED — Production-grade thinking. Optimization, architecture, interview-prep depth.";

  return `Generate learning units for this class.

Course: "${outline.title}"
Audience: ${context.audience || "General"}
Level: ${outline.difficulty || "Intermediate"}
Week ${weekNum}/${numWeeks}: "${weekTitle}"
Class ${classNum}: "${classTitle}"
Phase: ${phase}

Design 7-10 Learning Units following the STRUCTURE PATTERN. Make sure the content is specific to "${classTitle}" — not generic "Introduction to X" filler. End with exactly one graded_assignment.`;
}

// ═══════════════════════════════════════════════════════════
// GENERATE — Pass 1: outline, Pass 2: units-per-class (assignments inline)
// ═══════════════════════════════════════════════════════════

async function generate(context, onProgress) {
  // PASS 1: Generate course outline
  // Truncate topic if it came from a document (can be very long)
  const topicText = (context.topic || "").length > 1500
    ? (context.topic || "").slice(0, 1500) + "..."
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
{"title":"Course Title","description":"1-2 sentence description","difficulty":"Beginner","weeks":[{"number":1,"title":"Week Title","classes":[{"number":1,"title":"Class Title"},{"number":2,"title":"Class Title"},{"number":3,"title":"Class Title"}]}]}

Rules:
- EXACTLY ${numWeeks} weeks
- 2 to 5 classes per week depending on how much content that week needs
- The root object MUST have "title", "description", "difficulty", and "weeks" keys
- Each week MUST have "number", "title", and "classes" keys
- Titles must be SPECIFIC and descriptive, not generic ("Introduction to X" is banned — name the actual concept being taught)
- Difficulty curve: Week 1 = foundations, middle weeks = application, final week = advanced + capstone
- Difficulty field value: Beginner/Intermediate/Advanced based on audience`;

  let outline = null;

  // Try up to 3 times for outline generation
  for (let attempt = 0; attempt < 3; attempt++) {
    const outlineText = await callLLM(
      "You are a JSON generator. Return ONLY a valid JSON object with title, description, difficulty, and weeks array. No markdown, no explanation, just the JSON object.",
      [{ role: "user", content: outlinePrompt }],
      16000
    );

    const parsed = safeJSON(outlineText);

    // Handle various response shapes the LLM might return
    if (parsed?.weeks) {
      outline = parsed;
      break;
    }
    const inner = parsed?.course || parsed?.outline || parsed?.data;
    if (inner?.weeks) {
      outline = inner;
      break;
    }
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

  // Normalize week & class numbers to positional index. The LLM frequently
  // returns duplicate numbers (e.g. both classes as "number":1), which caused
  // Pass 2 events to overwrite the same slot on the frontend.
  outline.weeks.forEach((w, wi) => {
    w.number = wi + 1;
    (w.classes || []).forEach((c, ci) => { c.number = ci + 1; });
  });

  if (onProgress) onProgress("outline", outline);

  // PASS 2: Fill content for each class.
  const isCodingCourse = /programming|coding|software|developer|python|javascript|typescript|java|c\+\+|rust|go|ruby|php|swift|kotlin|react|angular|vue|node|docker|kubernetes|devops|api|backend|frontend|fullstack|full.stack|web.dev|data.struct|algorithm|machine.learn|deep.learn|ml|ai|database|sql|git|linux|bash|shell|cloud|aws|azure|gcp|html|css|flask|django|express|spring/i.test(context.topic || outline.title || "");

  const unitsSystemPrompt = buildUnitsSystemPrompt(isCodingCourse);

  // Patient retry — we want every class populated, even at the cost of time.
  async function generateClassUnits(weekNum, weekTitle, ci, classTitle) {
    const userMsg = buildUnitsUserPrompt(weekNum, weekTitle, ci + 1, classTitle, outline, context, numWeeks);

    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const text = await callLLM(unitsSystemPrompt, [{ role: "user", content: userMsg }], 65536);
        const data = safeJSON(text);
        const units = data?.learning_units || [];
        if (units.length > 0) {
          if (attempt > 0) {
            console.log(`✓ Week ${weekNum} Class ${ci + 1} rescued on attempt ${attempt + 1} — got ${units.length} units`);
          } else {
            console.log(`✓ Week ${weekNum} Class ${ci + 1} got ${units.length} units`);
          }
          // Interleaving warnings happen after post-processing (so is_interactive is set)
          const theoryFallback = units
            .filter((u) => u.type === "reading" || u.type === "video")
            .map((u) => `## ${u.title}\n\n${u.content}`)
            .join("\n\n---\n\n");
          return { title: classTitle, description: data?.description || `In-depth session covering ${classTitle}.`, theory_content: theoryFallback, learning_units: units };
        }
        console.log(`Units empty for Week ${weekNum} Class ${ci + 1}, attempt ${attempt + 1}/${MAX_ATTEMPTS}`);
      } catch (err) {
        console.log(`Units failed for Week ${weekNum} Class ${ci + 1}, attempt ${attempt + 1}/${MAX_ATTEMPTS}:`, err.message?.slice(0, 80));
      }
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      if (attempt < MAX_ATTEMPTS - 1) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 32000);
        console.log(`Retrying Week ${weekNum} Class ${ci + 1} in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    console.error(`Exhausted ${MAX_ATTEMPTS} attempts for Week ${weekNum} Class ${ci + 1} "${classTitle}" — returning empty`);
    return { title: classTitle, description: `In-depth session covering ${classTitle}.`, theory_content: "", learning_units: [] };
  }

  // Helper: run promises in batches of `size` to avoid rate limits
  async function runInBatches(tasks, size) {
    const results = [];
    for (let i = 0; i < tasks.length; i += size) {
      const batch = tasks.slice(i, i + size);
      const batchResults = await Promise.all(batch.map((fn) => fn()));
      results.push(...batchResults);
    }
    return results;
  }

  for (let i = 0; i < outline.weeks.length; i++) {
    const week = outline.weeks[i];

    if (onProgress) onProgress("status", { message: `Generating Week ${week.number}/${outline.weeks.length}: "${week.title}" (${week.classes.length} classes)...` });

    // Generate learning units per class. Assignments live INSIDE these units now,
    // so there's no second pass competing for rate limits → batch size 2 is safe.
    const classUnitTasks = (week.classes || []).map((cls, ci) => {
      const classTitle = cls?.title || `Class ${ci + 1}`;
      return () => generateClassUnits(week.number, week.title, ci, classTitle);
    });

    const classContents = await runInBatches(classUnitTasks, 2);

    // Simple positional merge — classContents[ci] lines up 1:1 with outline.
    outline.weeks[i].classes = (week.classes || []).map((outlineCls, ci) => {
      const cc = classContents[ci] || {};
      const classNumber = ci + 1;
      const classTitle = outlineCls?.title || `Class ${classNumber}`;

      // Normalize all learning units (starter_code fallback, MCQ shape, is_interactive tag)
      const units = postProcessLearningUnits(cc.learning_units || [], outline.title);

      // Run interleaving validation now that is_interactive is tagged
      if (units.length > 0) validateInterleaving(units, week.number, classNumber);

      // Backward-compat: extract graded units into the legacy class.assignments
      // array. The frontend MissionControl page still reads class.assignments;
      // eventually it should switch to iterating learning_units directly.
      const gradedAssignments = units
        .filter((u) => u.type === "graded_assignment" || u.type === "checkpoint_coding")
        .map((u) => ({
          title: u.title,
          description: u.content || u.description || "",
          type: "coding",
          difficulty: u.difficulty || "Intermediate",
          starter_code: u.starter_code || "",
          solution_code: u.solution_code || "",
          test_cases: u.test_cases || [],
          rubric: u.rubric || [],
          hints: u.hints || [],
          pitfalls: u.pitfalls || [],
          aha_moment: u.aha_moment || "",
          questions: u.questions || [],
          files: u.files || [],
        }));

      return {
        number: classNumber,
        title: classTitle,
        description: cc.description || outlineCls?.description || `Learn about ${classTitle}.`,
        theory_content: cc.theory_content || "",
        learning_units: units,
        assignments: gradedAssignments,
        references: [],
        resources: [],
      };
    });

    // Diagnostics per class
    outline.weeks[i].classes.forEach((c) => {
      if (!c.learning_units || c.learning_units.length === 0) {
        console.warn(`⚠ Week ${week.number} Class ${c.number} "${c.title}" has NO learning_units`);
      }
      const interactive = (c.learning_units || []).filter((u) => u.is_interactive).length;
      console.log(`  Class ${c.number}: ${c.learning_units.length} units, ${interactive} interactive, ${c.assignments.length} graded`);
    });

    if (onProgress) onProgress("week", outline.weeks[i]);
  }

  // ────────────────────────────────────────────────
  // PASS 3: Course Critic AI — evaluate and flag issues
  // ────────────────────────────────────────────────
  try {
    if (onProgress) onProgress("status", { message: "Running course quality review..." });

    const criticSummary = {
      title: outline.title,
      weeks: outline.weeks.map((w) => ({
        number: w.number, title: w.title,
        classes: (w.classes || []).map((c) => ({
          title: c.title,
          units: (c.learning_units || []).length,
          interactive_units: (c.learning_units || []).filter((u) => u.is_interactive).length,
          has_graded_assignment: (c.learning_units || []).some((u) => u.type === "graded_assignment"),
          has_theory: !!(c.theory_content && c.theory_content.length > 100),
        })),
      })),
    };

    const criticText = await callLLM(
      "You are a course quality reviewer. Evaluate this course structure and return actionable feedback as JSON.",
      [{ role: "user", content: `Review this course for quality issues:

${JSON.stringify(criticSummary)}

Return JSON:
{
  "overall_score": 1-10,
  "verdict": "one-sentence quality judgment",
  "issues": ["specific issue 1", "specific issue 2"],
  "suggestions": ["specific improvement 1", "specific improvement 2"]
}

Check for: redundant classes, missing content, unbalanced difficulty, classes without learning units, classes without a graded_assignment, insufficient interactivity, missing progression, gaps in knowledge flow.` }],
      4000
    );

    const criticResult = safeJSON(criticText);
    if (criticResult) {
      outline._critic = criticResult;
      console.log(`Course Critic: ${criticResult.overall_score}/10 — ${criticResult.verdict}`);
      if (criticResult.issues?.length > 0) console.log("  Issues:", criticResult.issues.join("; "));
    }
  } catch (err) {
    console.log("Critic pass skipped:", err.message?.slice(0, 60));
  }

  return outline;
}

function parseWeekCount(timeline) {
  const m = (timeline || "4 weeks").match(/(\d+)/);
  return Math.max(1, Math.min(parseInt(m?.[1] || "4"), 20));
}

module.exports = { chat, generate };
