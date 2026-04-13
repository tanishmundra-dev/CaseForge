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

const CHAT_SYSTEM = `You are a world-class curriculum architect who has designed top-rated courses for Coursera, Udemy, and Stanford Online. You respond as a JSON API. Respond with ONLY a JSON object.

You specialize in: deep pedagogy (Bloom's Taxonomy, scaffolding, spaced repetition), industry-relevant curriculum design, beginner → advanced learning progression, practical job-ready teaching.

═══ NO COURSE EXISTS ═══
Gather topic, audience, timeline through friendly conversation. Ask smart follow-up questions about:
- Skill level of target audience
- Specific outcomes they want (certification? job-ready? hobby?)
- Any domain focus (fintech, healthcare, gaming, etc.)
When ready: {"action":"generate","message":"confirmation text","context":{"topic":"...","audience":"...","timeline":"...","technologies":[],"additional_notes":""}}

═══ COURSE EXISTS (COURSE_CONTEXT provided) ═══
Handle modifications. You are REFINING an existing course.
Rules: Do NOT regenerate everything. Only modify the requested section. Maintain consistency. Preserve difficulty progression.

▸ Modify: {"action":"modify","message":"what changed","level":"meta|week|class|assignment","week":1,"class":1,"assignment_index":0,"data":{COMPLETE object}}
▸ Add assignment: {"action":"modify","message":"what changed","level":"add_assignment","week":1,"class":1,"data":{COMPLETE assignment}}

═══ ASSIGNMENT SCHEMAS ═══

CODING (type:"coding"): {"title":"...","description":"...","type":"coding","difficulty":"...","starter_code":"# 10+ lines real code with TODOs","solution_code":"# complete working solution","test_cases":[{"input":"...","expected_output":"...","description":"..."}],"rubric":[{"criterion":"...","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["..."],"pitfalls":["..."],"aha_moment":"...","questions":[],"files":[]}

QUIZ (type:"objective"): {"title":"...","description":"...","type":"objective","difficulty":"...","questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."},{"type":"fill_up","question":"The ___ is...","answer":"...","explanation":"..."}],"rubric":[],"hints":[],"pitfalls":[],"aha_moment":"","starter_code":"","test_cases":[],"files":[]}

IDE (type:"ide"): {"title":"...","description":"...","type":"ide","difficulty":"...","files":[{"name":"...","content":"...","language":"..."}],"rubric":[{"criterion":"...","excellent":"...","acceptable":"...","poor":"...","weight":50}],"hints":["..."],"pitfalls":["..."],"aha_moment":"...","starter_code":"","test_cases":[],"questions":[]}

═══ QUALITY BAR (CRITICAL) ═══
- Every assignment must be portfolio-worthy, not toy exercises
- Coding assignments: real starter code (10+ lines), complete solution_code, 3+ test cases with edge cases
- Quizzes: 5+ questions, industry-relevant, with explanations
- All content must match the difficulty curve: Week 1 = foundations, middle weeks = intermediate application, final weeks = advanced + capstone

═══ CONVERSATION ═══
{"action":"chat","message":"your friendly response"}

Rules: "message" is shown to the user — keep it natural. ALL data objects must be COMPLETE. NEVER return empty arrays or placeholder text.`;

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
${fileContent.slice(0, 20000)}`;
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

  const tokenLimit = currentCourse || fileContent ? 16000 : 4000;
  const text = await callLLM(systemPrompt, recent, tokenLimit);
  const parsed = safeJSON(text);
  if (parsed?.action) return parsed;
  if (parsed?.message) return { action: "chat", ...parsed };
  return { action: "chat", message: text.replace(/[{}]/g, "").slice(0, 300).trim() || "Could you rephrase that?" };
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
{"title":"Course Title","description":"Course description","difficulty":"Beginner","weeks":[{"number":1,"title":"Week Title","classes":[{"number":1,"title":"Class Title"},{"number":2,"title":"Class Title"},{"number":3,"title":"Class Title"}]}]}

Rules:
- EXACTLY ${numWeeks} weeks
- 2 to 5 classes per week depending on how much content that week needs
- The root object MUST have "title", "description", "difficulty", and "weeks" keys
- Each week MUST have "number", "title", and "classes" keys
- Make titles specific and descriptive
- Difficulty: Beginner/Intermediate/Advanced based on audience`;

  let outline = null;

  // Try up to 2 times for outline generation
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

  // Normalize week & class numbers to positional index. The LLM frequently
  // returns duplicate numbers (e.g. both classes as "number":1), which caused
  // Pass 2 week_content_class events to overwrite the same slot on the
  // frontend — making Class 2 of every week silently disappear.
  outline.weeks.forEach((w, wi) => {
    w.number = wi + 1;
    (w.classes || []).forEach((c, ci) => { c.number = ci + 1; });
  });

  if (onProgress) onProgress("outline", outline);

  // PASS 2: Fill content for each week (parallelized within each week)
  const isCodingCourse = /programming|coding|software|developer|python|javascript|typescript|java|c\+\+|rust|go|ruby|php|swift|kotlin|react|angular|vue|node|docker|kubernetes|devops|api|backend|frontend|fullstack|full.stack|web.dev|data.struct|algorithm|machine.learn|deep.learn|ml|ai|database|sql|git|linux|bash|shell|cloud|aws|azure|gcp|html|css|flask|django|express|spring/i.test(context.topic || outline.title || "");

  const codingExample = `{"title":"Coding Exercise","description":"What to build - 3+ sentences","type":"coding","difficulty":"...","starter_code":"# Real working starter code with TODOs for student to fill in\\ndef solve(n):\\n    # TODO: implement the solution\\n    pass\\n\\nif __name__ == '__main__':\\n    print(solve(5))","solution_code":"# COMPLETE working solution that passes ALL test cases\\ndef solve(n):\\n    if n <= 0: return 0\\n    if n == 1: return 1\\n    a, b = 0, 1\\n    for _ in range(2, n+1):\\n        a, b = b, a+b\\n    return b\\n\\nif __name__ == '__main__':\\n    print(solve(5))","test_cases":[{"input":"5","expected_output":"5","description":"fibonacci of 5"},{"input":"0","expected_output":"0","description":"edge case zero"},{"input":"10","expected_output":"55","description":"fibonacci of 10"}],"rubric":[{"criterion":"Correctness","excellent":"All test cases pass","acceptable":"Most test cases pass","poor":"Fails basic cases","weight":50},{"criterion":"Code Quality","excellent":"Clean, efficient, well-structured","acceptable":"Works but could be cleaner","poor":"Messy or inefficient","weight":50}],"hints":["concrete hint"],"pitfalls":["common mistake"],"aha_moment":"key insight"}`;

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

  // Helper: generate learning units for a single class
  function buildUnitsPrompt(weekNum, weekTitle, classNum, classTitle) {
    const phase = weekNum <= Math.ceil(numWeeks / 3) ? "FOUNDATIONS" : weekNum <= Math.ceil(numWeeks * 2 / 3) ? "INTERMEDIATE" : "ADVANCED";
    return `You are a Course Platform Designer who designs courses like Coursera/Udemy. You structure content into individually completable Learning Units that mix passive learning (video/reading) with active practice (activity/quiz).

Course: "${outline.title}" | Audience: ${context.audience} | Level: ${outline.difficulty || "Intermediate"}
Week ${weekNum}/${numWeeks}: "${weekTitle}" > Class ${classNum}: "${classTitle}"
Phase: ${phase} — ${phase === "FOUNDATIONS" ? "Build intuition from zero. Assume no prior knowledge of this topic." : phase === "INTERMEDIATE" ? "Apply to real-world scenarios. Introduce complexity and trade-offs." : "Production-grade thinking. Optimization, architecture, interview prep."}

Design this class as a sequence of 6-10 Learning Units. Each unit is individually completable (like Coursera modules).

UNIT TYPE RULES:
- "video": For concept introductions, storytelling, walkthroughs. Content = detailed transcript/explanation (500+ words). Include a YouTube recommendation from a real channel if the topic is common.
- "reading": For structured reference material, definitions, frameworks, deep-dives. Content = comprehensive markdown (800+ words). ${isCodingCourse ? "Include real runnable code blocks with explanations." : "Include real-world case studies."}
- "activity": For immediate hands-on practice. Content = clear instructions for what the student should do/think about. Short (100-200 words).
- "quiz": For reinforcement after a concept. MUST include a "questions" array with 3-5 structured questions. Each question: {"question":"...", "options":["A","B","C","D"], "correct":0, "explanation":"..."} for MCQ, or {"question":"The ___ is...", "type":"fill_up", "answer":"...", "explanation":"..."} for fill-up. These are interactive and graded in the UI.

STRUCTURE RULES:
- Start with a "video" or "reading" unit that hooks the student (a problem, a story, a real-world scenario)
- Alternate between passive (video/reading) and active (activity/quiz) — never 3 passive units in a row
- Each concept: introduce via video/reading → reinforce via activity/quiz
- End with a "reading" unit summarizing key takeaways + what's next
- Total class duration: 60-90 minutes
- No unit should exceed 20 minutes

CONTENT QUALITY ($150 paid course bar):
- "video" units: Write as a detailed transcript. Start with "Why does this matter?". Use analogies. ${isCodingCourse ? "Include screen-recording style walkthroughs: 'Now open your terminal and type...'" : "Include real company examples."}
- "reading" units: Deep, structured, with headers. Include 💡 Pro Tips, ⚠️ Common Mistakes, 🎯 Key Insights. ${isCodingCourse ? "8+ code blocks with real runnable code." : "Real-world case studies with specific details."}
- "activity" units: Specific, actionable tasks. "Open your editor and..." or "Think about how you would..."
- "quiz" units: Technical questions that test understanding, not memorization. Include explanations.
- NO filler. NO "In this section...". Every sentence must teach something.
- For video units: provide a "video_search_query" — a SPECIFIC YouTube search query (5-10 words) that will find a relevant tutorial. Example: "Docker compose multi container tutorial 2024". Also suggest a channel name.
- NEVER generate fake YouTube URLs — only generate search queries
- For niche topics, mark as "AI-generated lecture" and write the full content yourself

Return JSON:
{
  "description": "3-4 sentence class description — what transformation happens",
  "learning_units": [
    {
      "type": "video",
      "title": "Why ${classTitle} Matters",
      "duration": 12,
      "content": "Full detailed content in markdown (500+ words for video, 800+ for reading)...",
      "completion_type": "auto",
      "video_search_query": "specific YouTube search query to find a relevant tutorial, e.g. 'Python Docker containerize flask app tutorial 2024'",
      "video_channel": "Recommended channel to look for (e.g. 'Traversy Media', 'freeCodeCamp', 'Fireship')"
    },
    {
      "type": "reading",
      "title": "Deep Dive: Core Concept",
      "duration": 15,
      "content": "# Heading\\n\\nFull markdown content with code blocks, examples, pro tips...",
      "completion_type": "auto"
    },
    {
      "type": "activity",
      "title": "Hands-On: Try It Yourself",
      "duration": 10,
      "content": "Step-by-step instructions for what to do...",
      "completion_type": "manual"
    },
    {
      "type": "quiz",
      "title": "Check Your Understanding",
      "duration": 5,
      "content": "Test your understanding of the concepts covered so far.",
      "completion_type": "graded",
      "questions": [
        {"question": "What is X?", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "A is correct because..."},
        {"question": "Which of these is true about Y?", "options": ["Option 1", "Option 2", "Option 3", "Option 4"], "correct": 2, "explanation": "Option 3 because..."},
        {"question": "The ___ is used to...", "type": "fill_up", "answer": "keyword", "explanation": "Because..."}
      ]
    }
  ]
}`;
  }

  // Helper: generate assignments prompt for a week
  function buildWeekPrompt(week) {
    return `Generate assignments and learning resources for Week ${week.number}: "${week.title}" of "${outline.title}" for ${context.audience}.

${assignmentGuidance}

For each class, also generate a "resources" array with:
- 2-3 YouTube video resources. NEVER generate fake YouTube URLs. Instead use this format:
  {"type":"video","title":"Descriptive video title","video_search_query":"specific YouTube search query 5-10 words","channel":"Recommended Channel Name","description":"What this covers and why it's useful"}
- 2-3 blog/article recommendations (use REAL well-known sites: MDN, Real Python, freeCodeCamp, GeeksforGeeks, dev.to, official docs)
  Format: {"type":"article","title":"Article title","url":"https://...","source":"Site Name","description":"What this covers"}
- 1 official documentation link if applicable
  Format: {"type":"docs","title":"Official Docs - Topic","url":"https://docs.python.org/... or similar REAL doc URL","source":"Official","description":"Reference documentation"}

This week has ${week.classes.length} classes: ${week.classes.map((c, i) => `Class ${i + 1}: "${c.title}"`).join(", ")}

Return JSON: {"classes":[
${week.classes.map((c, i) => `  {"number":${i + 1},"title":"${c.title || `Class ${i + 1}`}","resources":[... video, article, docs objects ...],"assignments":[... see assignment examples above ...]}`).join(",\n")}
]}

Rules:
- "coding" assignments MUST have "starter_code" (10+ lines), "solution_code" (complete working solution), and "test_cases" (3+ with edge cases)
- Quizzes MUST have 5+ questions with real technical content
- Resources MUST use real, well-known educational URLs — not made-up links
- YouTube URLs should point to real channels known for this topic
- Make content progressively harder (week ${week.number} of ${numWeeks})
- EVERY field must have real content`;
  }

  // Helper: post-process assignments
  function postProcessAssignments(assignments) {
    return (assignments || []).map((a) => {
      const type = a.type || "coding";
      const asn = {
        title: a.title || "Exercise",
        description: a.description || "Practice exercise",
        type,
        difficulty: a.difficulty || "Intermediate",
        starter_code: a.starter_code || "",
        solution_code: a.solution_code || "",
        test_cases: a.test_cases || [],
        rubric: a.rubric || [],
        hints: a.hints || [],
        pitfalls: a.pitfalls || [],
        aha_moment: a.aha_moment || "",
        questions: a.questions || [],
        files: a.files || [],
      };
      if (type === "coding" && !asn.starter_code.trim()) {
        asn.starter_code = generateFallbackStarterCode(asn.title, outline.title);
      }
      if (type === "coding" && asn.test_cases.length === 0) {
        asn.test_cases = [
          { input: "", expected_output: "Output:", description: "Should produce output" },
        ];
      }
      if (type === "objective" && asn.questions.length === 0) {
        asn.type = "coding";
        asn.starter_code = generateFallbackStarterCode(asn.title, outline.title);
      }
      return asn;
    });
  }

  // Helper: call LLM for a single class's learning units.
  // Patient retry — we want every class populated, even at the cost of time.
  async function generateClassUnits(weekNum, weekTitle, ci, classTitle) {
    const prompt = buildUnitsPrompt(weekNum, weekTitle, ci + 1, classTitle);
    const systemMsg = "You are a Coursera-level course platform designer. Generate structured learning units with deep, engaging content. Each unit must be individually completable. Mix video/reading/activity/quiz. Minimum 6 units per class. All content must be real and substantive — no placeholders.";

    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const text = await callLLM(systemMsg, [{ role: "user", content: prompt }], 65536);
        const data = safeJSON(text);
        const units = data?.learning_units || [];
        if (units.length > 0) {
          if (attempt > 0) {
            console.log(`✓ Week ${weekNum} Class ${ci + 1} rescued on attempt ${attempt + 1} — got ${units.length} units`);
          } else {
            console.log(`✓ Week ${weekNum} Class ${ci + 1} got ${units.length} units`);
          }
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
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s (caps at ~1 min total wait)
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

    // ────────────────────────────────────────────────
    // Run Pass 2A (classes in batches of 2) + Pass 2B (assignments) IN PARALLEL
    // ────────────────────────────────────────────────

    // Pass 2A: class units in batches of 2 to avoid rate limits
    const classUnitTasks = (week.classes || []).map((cls, ci) => {
      const classTitle = cls?.title || `Class ${ci + 1}`;
      return () => generateClassUnits(week.number, week.title, ci, classTitle);
    });

    // Pass 2B: assignments for the whole week (runs concurrently with 2A batches)
    const assignmentPromise = callLLM(
      "Generate course assignments and curated learning resources as JSON. Use real YouTube channels and blog URLs.",
      [{ role: "user", content: buildWeekPrompt(week) }],
      49152
    ).then((text) => safeJSON(text)).catch((err) => {
      console.log(`Assignments failed for Week ${week.number}:`, err.message?.slice(0, 80));
      return null;
    });

    // Run class batches and assignments concurrently.
    // Batch size of 1 = strict sequential per class. Slower, but avoids rate-limit
    // collisions that were causing classes to land with empty learning_units.
    const [classContents, weekData] = await Promise.all([
      runInBatches(classUnitTasks, 1),
      assignmentPromise,
    ]);

    // ────────────────────────────────────────────────
    // Merge results
    //
    // The outline (pass 1) is the source of truth for WHICH classes exist.
    // classContents[ci] is aligned to outline order (because generateClassUnits
    // was called once per outline class, in order, via runInBatches).
    // weekData.classes (assignments LLM call) may be in a DIFFERENT order,
    // have an EXTRA hallucinated class, or DROP one — never trust its index.
    // Match assignments/resources back to outline classes by title/number.
    // ────────────────────────────────────────────────
    const matchWeekClass = (outlineClass, ci) => {
      const list = weekData?.classes || [];
      // 1. Match by class number
      let match = list.find((c) => c?.number === (outlineClass?.number ?? ci + 1));
      // 2. Match by title (case-insensitive)
      if (!match && outlineClass?.title) {
        const t = outlineClass.title.toLowerCase().trim();
        match = list.find((c) => (c?.title || "").toLowerCase().trim() === t);
      }
      // 3. Loose title-contains match
      if (!match && outlineClass?.title) {
        const t = outlineClass.title.toLowerCase().trim();
        match = list.find((c) => {
          const ct = (c?.title || "").toLowerCase().trim();
          return ct && (ct.includes(t) || t.includes(ct));
        });
      }
      // 4. Last resort: positional
      if (!match) match = list[ci];
      return match;
    };

    outline.weeks[i].classes = (week.classes || []).map((outlineCls, ci) => {
      const cc = classContents[ci] || {};                // units (aligned to outline)
      const wc = matchWeekClass(outlineCls, ci) || {};   // assignments (matched by title)
      // Always use positional index — trusting outlineCls.number can collapse
      // multiple classes into the same slot if the LLM repeats numbers.
      const classNumber = ci + 1;
      const classTitle = outlineCls?.title || wc.title || `Class ${classNumber}`;
      const hasAssignments = Array.isArray(wc.assignments) && wc.assignments.length > 0;

      return {
        number: classNumber,
        title: classTitle,
        description: cc.description || wc.description || outlineCls?.description || `Learn about ${classTitle}.`,
        theory_content: cc.theory_content || wc.theory_content || "",
        learning_units: cc.learning_units || [],
        references: wc.references || wc.resources || [],
        resources: wc.resources || [],
        assignments: hasAssignments
          ? postProcessAssignments(wc.assignments)
          : [{
              title: `${classTitle} Exercise`, description: "Practice what you learned.",
              type: "coding", difficulty: "Intermediate",
              starter_code: `// ${classTitle}\nfunction solve() {\n  // TODO\n}\nconsole.log(solve());`,
              test_cases: [], rubric: [], hints: [], pitfalls: [], aha_moment: "", questions: [], files: [],
            }],
      };
    });

    // Diagnostic: log any class that ended up without units after the merge
    outline.weeks[i].classes.forEach((c) => {
      if (!c.learning_units || c.learning_units.length === 0) {
        console.warn(`⚠ Week ${week.number} Class ${c.number} "${c.title}" has NO learning_units after merge`);
      }
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
          assignments: (c.assignments || []).length,
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

Check for: redundant classes, missing content, unbalanced difficulty, classes without learning units, classes without assignments, missing progression, gaps in knowledge flow.` }],
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
