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

    // ────────────────────────────────────────────────
    // PASS 2A: Generate DEEP lecture notes per class
    // ────────────────────────────────────────────────
    const classContents = [];
    for (let ci = 0; ci < (week.classes || []).length; ci++) {
      const classTitle = week.classes[ci]?.title || `Class ${ci + 1}`;
      const phase = week.number <= Math.ceil(numWeeks / 3) ? "FOUNDATIONS" : week.number <= Math.ceil(numWeeks * 2 / 3) ? "INTERMEDIATE" : "ADVANCED";
      const lecturePrompt = `You are a world-class instructor who has taught 100,000+ students on Coursera and Udemy. You are writing a COMPLETE lecture for a paid premium course ($100+ value).

YOUR PEDAGOGY: Start from INTUITION → then formal concept → then APPLICATION → then edge cases. Every section must answer "Why does this matter?" before diving in. Use Bloom's Taxonomy: Remember → Understand → Apply → Analyze → Evaluate → Create.

Course: "${outline.title}" | Audience: ${context.audience} | Level: ${outline.difficulty || "Intermediate"}
Week ${week.number}/${numWeeks}: "${week.title}" > Class ${ci + 1}: "${classTitle}"
Phase: ${phase} — ${phase === "FOUNDATIONS" ? "Build strong intuition and mental models. Assume ZERO prior knowledge of this specific topic." : phase === "INTERMEDIATE" ? "Apply concepts to real-world scenarios. Challenge assumptions. Introduce complexity." : "Production-grade thinking. Trade-offs, optimization, architecture decisions. Prepare for interviews and real jobs."}

Write a COMPLETE lecture in markdown. This is the ONLY study material students have before attempting assignments. It must teach the topic thoroughly enough that a student with ZERO prior knowledge of this specific topic can understand it, practice it, and pass certification-level assessments.

REQUIRED STRUCTURE (follow this exactly):

# ${classTitle}

## Learning Objectives
- List 4-6 specific, measurable learning objectives ("By the end of this lesson, you will be able to...")

## Prerequisites
- What the student should know before this lesson (reference previous weeks/classes if applicable)

## Introduction
- Why this topic matters (real-world context, industry relevance)
- Where this fits in the bigger picture of the course
- A motivating example or scenario (3-4 paragraphs)

## Core Concepts
### [Concept 1 Name]
- Detailed explanation with examples (not just definitions)
- Diagrams described in text if relevant
- Common misconceptions addressed
${isCodingCourse ? "- Code examples with line-by-line explanation" : "- Worked examples with step-by-step reasoning"}

### [Concept 2 Name]
- Same depth as above
- Build on Concept 1 where possible

### [Concept 3+ Name]
- Continue for all key concepts (typically 3-5 per class)

## Deep Dive / Advanced Details
- Edge cases, gotchas, performance considerations
- Industry best practices
- How professionals actually use this in production
${isCodingCourse ? "- Common bugs and how to debug them\n- Time/space complexity analysis where relevant" : "- Common mistakes in applying these concepts\n- How experts think about this differently than beginners"}

## Worked Examples
- 2-3 complete worked examples, starting simple and increasing complexity
${isCodingCourse ? "- Full code with comments explaining each step\n- Show the output and explain why" : "- Step-by-step solutions to realistic problems"}

## Practice Exercises (conceptual)
- 3-4 quick self-check questions (not graded, just for self-assessment)
- Answers included inline

## Key Takeaways
- Bullet-point summary of the most important concepts
- "Remember this" highlights

## What's Next
- Brief preview of how this connects to the next class/topic

QUALITY BAR (this is a $150 paid course — match that quality):
- MINIMUM 2000 words (aim for 3000+ for technical topics)
- Every concept: intuition FIRST ("imagine you're..."), then formal definition, then hands-on example, then edge cases
- ${isCodingCourse ? "Include 8+ code blocks with REAL, RUNNABLE code. Show input AND output. Explain line-by-line for complex code." : "Include 5+ real-world case studies. Use specific company names, real data scenarios, actual industry examples."}
- Use analogies and metaphors to explain complex ideas (e.g., "Think of a Docker container like a shipping container...")
- Include "💡 Pro Tip" callouts for industry wisdom
- Include "⚠️ Common Mistake" callouts for pitfalls
- Include "🎯 Key Insight" callouts for aha moments
- Write like you're TALKING to the student — conversational, engaging, not textbook-dry
- After each major concept, include a "✅ Check Your Understanding" mini-question
- NO fluff, NO generic explanations, NO "in this section we will learn..." filler
- Every paragraph must teach something SPECIFIC and ACTIONABLE
- A student who reads ONLY this lecture should be able to pass a certification exam on this topic

CONTENT RULES:
- DO NOT start with "In this lesson..." or "We will cover..." — START with a hook (a problem, a story, a question)
- DO NOT give dictionary definitions — give INTUITIVE explanations with examples
- DO NOT repeat the same concept in different words to pad length — add NEW value in every sentence
- DO use real tool names, real library names, real command-line examples
- DO include "Before vs After" comparisons when introducing new concepts
- DO end with a clear bridge to the next lesson

Return JSON: {"theory_content": "the complete markdown lesson (use \\n for newlines)", "description": "3-4 sentence class description that explains the TRANSFORMATION — what the student can DO after this class that they couldn't before"}`;

      const lectureText = await callLLM(
        "You are a world-class course instructor writing premium lecture content. Write like the best Coursera instructor — deep, practical, engaging. Minimum 2000 words. Every concept needs intuition + example + edge cases. No filler. No generic text. Real code, real scenarios, real value.",
        [{ role: "user", content: lecturePrompt }],
        32768
      );
      const lectureData = safeJSON(lectureText);
      classContents.push({
        title: classTitle,
        theory_content: lectureData?.theory_content || "",
        description: lectureData?.description || `In-depth session covering ${classTitle}.`,
      });
      if (onProgress) onProgress("status", { message: `Writing lecture for Week ${week.number}, Class ${ci + 1}...` });
    }

    // ────────────────────────────────────────────────
    // PASS 2B: Generate assignments + resources per week
    // ────────────────────────────────────────────────
    const weekPrompt = `Generate assignments and learning resources for Week ${week.number}: "${week.title}" of "${outline.title}" for ${context.audience}.

${assignmentGuidance}

For each class, also generate a "resources" array with:
- 2-3 YouTube video recommendations (real channels: Corey Schafer, Traversy Media, freeCodeCamp, Fireship, Net Ninja, Sentdex, TechWorld with Nana, etc.)
  Format: {"type":"video","title":"Video title","url":"https://youtube.com/watch?v=...","channel":"Channel Name","description":"What this video covers and why it's useful"}
- 2-3 blog/article recommendations (real sites: MDN, Real Python, freeCodeCamp, GeeksforGeeks, Medium, dev.to, official docs)
  Format: {"type":"article","title":"Article title","url":"https://...","source":"Site Name","description":"What this covers"}
- 1 official documentation link if applicable
  Format: {"type":"docs","title":"Official Docs - Topic","url":"https://docs...","source":"Official","description":"Reference documentation"}

Return JSON: {"classes":[
  {
    "number":1,"title":"${week.classes[0]?.title || 'Class 1'}",
    "resources":[... video, article, docs objects ...],
    "assignments":[... see assignment examples above ...]
  },
  {
    "number":2,"title":"${week.classes[1]?.title || 'Class 2'}",
    "resources":[... video, article, docs objects ...],
    "assignments":[... see assignment examples above ...]
  }
]}

Rules:
- "coding" assignments MUST have "starter_code" (10+ lines), "solution_code" (complete working solution), and "test_cases" (3+ with edge cases)
- Quizzes MUST have 5+ questions with real technical content
- Resources MUST use real, well-known educational URLs — not made-up links
- YouTube URLs should point to real channels known for this topic
- Make content progressively harder (week ${week.number} of ${numWeeks})
- EVERY field must have real content`;

    const weekText = await callLLM(
      "Generate course assignments and curated learning resources as JSON. Use real YouTube channels and blog URLs.",
      [{ role: "user", content: weekPrompt }],
      12288
    );

    const weekData = safeJSON(weekText);
    if (weekData?.classes) {
      outline.weeks[i].classes = weekData.classes.map((cls, ci) => ({
        number: ci + 1,
        title: cls.title || week.classes[ci]?.title || `Class ${ci + 1}`,
        description: classContents[ci]?.description || cls.description || `Learn about ${cls.title || 'this topic'}.`,
        theory_content: classContents[ci]?.theory_content || cls.theory_content || "",
        references: cls.references || cls.resources || [],
        resources: cls.resources || [],
        assignments: (cls.assignments || []).map((a) => {
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
        description: classContents[ci]?.description || `Hands-on session covering ${cls.title || 'key concepts'}.`,
        theory_content: classContents[ci]?.theory_content || `# ${cls.title || 'Class ' + (ci + 1)}\n\nThis lesson covers the key concepts of ${cls.title || 'this topic'}.`,
        references: [],
        resources: [],
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
