const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODELS = ["gemini-1.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash"];

const CHAT_SYSTEM_PROMPT = `You are CaseForge AI, a curriculum design expert.
Gather: topic, audience level, and timeline (weeks). If all 3 present, set ready=true.
Respond ONLY with JSON (no markdown):
{"ready":false,"message":"..."} or {"ready":true,"message":"...","context":{"topic":"...","audience":"...","timeline":"...","technologies":[],"additional_notes":""}}`;

const GENERATE_SYSTEM_PROMPT = `Generate a course as JSON. Each week: 2 classes, each class: 1-2 assignments.
Assignment types: "objective" (MCQs with questions array), "coding" (starter_code, test_cases, rubric), "ide" (files array).
Each class should have a "references" array with 2-3 objects: {"title":"...","url":"...","description":"..."}.
Include hints, pitfalls, aha_moment. Be realistic and progressively challenging.
Output ONLY valid JSON: {"title":"...","description":"...","difficulty":"...","weeks":[...]}`;

// ── Gemini API call with model fallback ──
async function callGemini(systemPrompt, contents, useChat = false, history = []) {
  let lastError = null;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      if (useChat) {
        const chat = model.startChat({
          history,
          systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
        });
        const result = await chat.sendMessage(contents);
        return result.response.text().trim();
      } else {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: contents }] }],
          systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
        });
        return result.response.text().trim();
      }
    } catch (err) {
      lastError = err;
      if (err.status === 429) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastError || new Error("All models failed");
}

function parseJSON(text) {
  return JSON.parse(text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim());
}

// ── Public: Chat ──
async function chatWithGemini(messages) {
  const filtered = messages.filter((m) => m.role === "user" || m.role === "assistant");
  let start = 0;
  while (start < filtered.length && filtered[start].role === "assistant") start++;
  const valid = filtered.slice(start);
  if (valid.length === 0) return { ready: false, message: "What course would you like to create?" };

  const history = valid.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));

  try {
    const text = await callGemini(CHAT_SYSTEM_PROMPT, valid[valid.length - 1].content, true, history);
    return parseJSON(text);
  } catch (err) {
    console.error("Gemini failed, using fallback:", err.message);
    return chatFallback(valid);
  }
}

// ── Public: Generate ──
async function generateCourse(context) {
  const prompt = `Create a course: topic="${context.topic}", audience="${context.audience}", timeline="${context.timeline}", tech="${(context.technologies || []).join(", ") || "appropriate for topic"}". Include references for each class.`;
  try {
    const text = await callGemini(GENERATE_SYSTEM_PROMPT, prompt, false);
    return parseJSON(text);
  } catch (err) {
    console.error("Gemini generation failed, using fallback:", err.message);
    return generateFallback(context);
  }
}

// ═══════════════════════════════════════════════════════════
//  FALLBACK — State-tracking, no regex NLP
// ═══════════════════════════════════════════════════════════

function chatFallback(allMessages) {
  const userMsgs = allMessages.filter((m) => m.role === "user").map((m) => m.content);
  const state = { topic: null, audience: null, timeline: null };

  // Process each user message in order to build state
  for (const msg of userMsgs) {
    updateState(state, msg);
  }

  if (state.topic && state.audience && state.timeline) {
    return {
      ready: true,
      message: `Designing a ${state.timeline} course on "${state.topic}" for ${state.audience}. Generating now...`,
      context: {
        topic: state.topic,
        audience: state.audience,
        timeline: state.timeline,
        technologies: [],
        additional_notes: "",
      },
    };
  }

  const missing = [];
  if (!state.timeline) missing.push("how many weeks (e.g., 3, 4, 6)");
  if (!state.audience) missing.push("the audience level (e.g., beginners, interns, experienced devs)");

  if (state.topic && missing.length > 0) {
    return { ready: false, message: `Got it — "${state.topic}". I just need: ${missing.join(" and ")}?` };
  }

  // We have enough to go with defaults
  if (state.topic) {
    return {
      ready: true,
      message: `Generating a course on "${state.topic}". Here we go...`,
      context: {
        topic: state.topic,
        audience: state.audience || "general learners",
        timeline: state.timeline || "4 weeks",
        technologies: [],
        additional_notes: "",
      },
    };
  }

  return { ready: false, message: "What topic should the course cover?" };
}

function updateState(state, msg) {
  const lower = msg.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // ── Timeline: any number + week/month, or bare number ──
  const timeMatch = lower.match(/(\d+)\s*(weeks?|months?)/i);
  if (timeMatch) {
    state.timeline = `${timeMatch[1]} ${timeMatch[2].replace(/s?$/, "s")}`;
  } else if (/^\d{1,2}$/.test(lower)) {
    state.timeline = `${lower} weeks`;
  }

  // ── Audience: fuzzy keyword matching (handles typos) ──
  const audiencePatterns = [
    // Two-word patterns first
    { regex: /junior\s+intern/i, label: "junior interns" },
    { regex: /senior\s+dev/i, label: "senior developers" },
    { regex: /experienced\s+dev/i, label: "experienced developers" },
    { regex: /college\s+student/i, label: "college students" },
    // Class/standard patterns
    { regex: /(12th|10th|11th|9th|8th)\s*(standard|class|grade)?/i, label: null, extract: true },
    // Single words with fuzzy matching (catches typos like begginer, begginners, etc.)
    { regex: /\bbeg+[ia]n+e?r?s?\b/i, label: "beginners" },
    { regex: /\binterns?\b/i, label: "interns" },
    { regex: /\bjuniors?\b/i, label: "junior developers" },
    { regex: /\bseniors?\b/i, label: "senior developers" },
    { regex: /\bexperienced?\b/i, label: "experienced developers" },
    { regex: /\bfreshers?\b/i, label: "freshers" },
    { regex: /\bstudents?\b/i, label: "students" },
    { regex: /\bgraduates?\b/i, label: "graduates" },
    { regex: /\btrainees?\b/i, label: "trainees" },
    { regex: /\bintermediate\b/i, label: "intermediate developers" },
    { regex: /\badvanced\b/i, label: "advanced developers" },
    { regex: /\bprofessionals?\b/i, label: "professionals" },
    { regex: /\bnewbies?\b/i, label: "beginners" },
    { regex: /\bnovice\b/i, label: "beginners" },
    { regex: /\bentry[\s-]?level\b/i, label: "beginners" },
    { regex: /\bworking\s+professionals?\b/i, label: "working professionals" },
  ];

  if (!state.audience) {
    for (const p of audiencePatterns) {
      const match = lower.match(p.regex);
      if (match) {
        if (p.extract) {
          state.audience = `${match[1]} standard students`;
        } else {
          state.audience = p.label;
        }
        break;
      }
    }
  }

  // ── Topic: first substantial message that isn't just audience/timeline ──
  // Only set topic from messages that have real content (not just "3" or "experienced")
  if (!state.topic && words.length >= 3) {
    // Clean the message: remove filler, audience words, timeline
    let topic = msg
      .replace(/\b(i want|i need|create|build|make|design|can you|please|let's|lets)\b/gi, "")
      .replace(/\b(a |an )\b/gi, "")
      .replace(/\b(course|curriculum|program)\s*(on|for|about|in|of)?\b/gi, "")
      // Remove audience phrases (including typos)
      .replace(/\bfor\s+\d+\s*(weeks?|months?)\b/gi, "")
      .replace(/\bfor\s+beg+[ia]n+e?r?s?\b/gi, "")
      .replace(/\bfor\s+(junior|senior|experienced|intermediate|advanced)\s*(interns?|devs?|developers?|students?|learners?|professionals?)?\b/gi, "")
      .replace(/\bfor\s+(interns?|devs?|developers?|students?|freshers?|trainees?|graduates?|newbies?|novices?)\b/gi, "")
      .replace(/\bbeg+[ia]n+e?r?s?\b/gi, "")
      .replace(/\b(junior|senior|experienced|intermediate|advanced)\s*(interns?|devs?|developers?)?\b/gi, "")
      .replace(/\b\d+\s*(weeks?|months?|days?)\b/gi, "")
      .replace(/\b(and|for|it is|it's|the|this|that|of)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    // Capitalize properly
    if (topic.length >= 3) {
      topic = topic.split(" ").map((w) =>
        w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()
      ).join(" ").trim();
      state.topic = topic;
    }
  }

  // If topic exists and this message has corrections, update
  if (state.topic && words.length >= 3 && /\b(change|update|switch|no |actually|instead)\b/i.test(lower)) {
    const newTopic = msg
      .replace(/\b(no|actually|instead|change|update|switch)\s*(to|it to|the topic to|course to)?\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (newTopic.length >= 3) {
      state.topic = newTopic.split(" ").map((w) =>
        w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()
      ).join(" ").trim();
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  FALLBACK COURSE GENERATION
// ═══════════════════════════════════════════════════════════

const COURSE_TEMPLATES = {
  "node": buildNodeCourse,
  "react": buildReactCourse,
  "full stack": buildFullStackCourse,
  "python": buildPythonCourse,
  "javascript": buildJavaScriptCourse,
};

function generateFallback(context) {
  const topic = context.topic || "Software Development";
  const lower = topic.toLowerCase();
  const timeMatch = (context.timeline || "4 weeks").match(/(\d+)/);
  const numWeeks = Math.min(parseInt(timeMatch?.[1] || "4"), 8);
  const audience = context.audience || "developers";

  // Find matching template builder
  for (const [key, builder] of Object.entries(COURSE_TEMPLATES)) {
    if (lower.includes(key)) return builder(numWeeks, audience, topic);
  }
  return buildGenericCourse(numWeeks, audience, topic);
}

// ── Node.js Course ──
function buildNodeCourse(numWeeks, audience, topic) {
  const allWeeks = [
    { title: "Node.js Core & Runtime", classes: [
      { title: "Event Loop, V8 & Non-Blocking I/O", desc: "Understand how Node.js executes code — the event loop, callback queue, libuv, and why single-threaded doesn't mean slow.", refs: [
        { title: "Node.js Event Loop — Official Docs", url: "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick", description: "Deep dive into the event loop phases" },
        { title: "Philip Roberts: What the heck is the event loop anyway?", url: "https://www.youtube.com/watch?v=8aGhZQkoFbQ", description: "Classic talk explaining the event loop visually" },
      ]},
      { title: "Modules, Streams & File System", desc: "CommonJS vs ES modules, readable/writable streams for large data, and async file operations with fs/promises.", refs: [
        { title: "Node.js Streams Handbook", url: "https://nodejs.org/api/stream.html", description: "Official stream API documentation" },
        { title: "Understanding Streams in Node.js", url: "https://nodesource.com/blog/understanding-streams-in-nodejs", description: "Practical guide to Node.js streams" },
      ]},
    ]},
    { title: "Building REST APIs with Express", classes: [
      { title: "Express Routing, Middleware & Error Handling", desc: "Build a REST API from scratch: route params, query strings, middleware chain, custom error handlers, and request validation.", refs: [
        { title: "Express.js Official Guide", url: "https://expressjs.com/en/guide/routing.html", description: "Express routing documentation" },
        { title: "MDN: Express Tutorial", url: "https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs", description: "Step-by-step Express tutorial" },
      ]},
      { title: "Database Integration & ORMs", desc: "Connect to PostgreSQL with Prisma/Sequelize, write migrations, handle relationships, and implement pagination.", refs: [
        { title: "Prisma Getting Started", url: "https://www.prisma.io/docs/getting-started", description: "Modern ORM for Node.js" },
        { title: "PostgreSQL + Node.js Guide", url: "https://node-postgres.com/", description: "Low-level pg driver documentation" },
      ]},
    ]},
    { title: "Authentication, Security & Testing", classes: [
      { title: "JWT Auth, Bcrypt & Security Best Practices", desc: "Implement authentication with JWT tokens, password hashing, rate limiting, CORS, helmet, and OWASP top-10 defenses.", refs: [
        { title: "OWASP Node.js Security Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html", description: "Security best practices for Node.js" },
        { title: "JWT.io Introduction", url: "https://jwt.io/introduction", description: "Understanding JSON Web Tokens" },
      ]},
      { title: "Testing with Jest & Supertest", desc: "Unit tests, integration tests for API endpoints, mocking dependencies, and CI-ready test configurations.", refs: [
        { title: "Jest Documentation", url: "https://jestjs.io/docs/getting-started", description: "JavaScript testing framework" },
        { title: "Supertest GitHub", url: "https://github.com/ladjs/supertest", description: "HTTP assertion library for testing Express" },
      ]},
    ]},
    { title: "Performance, Deployment & Production", classes: [
      { title: "Clustering, Caching & Performance Tuning", desc: "Worker threads, cluster module, Redis caching, profiling with clinic.js, and memory leak detection.", refs: [
        { title: "Node.js Cluster Documentation", url: "https://nodejs.org/api/cluster.html", description: "Built-in clustering for multi-core usage" },
        { title: "Clinic.js - Performance Profiling", url: "https://clinicjs.org/", description: "Tools to diagnose Node.js performance issues" },
      ]},
      { title: "Docker, CI/CD & Production Monitoring", desc: "Containerize with Docker, deploy to AWS/Railway, set up GitHub Actions, and add monitoring with PM2 + logging.", refs: [
        { title: "Dockerizing a Node.js App", url: "https://nodejs.org/en/docs/guides/nodejs-docker-webapp", description: "Official guide to Docker with Node.js" },
        { title: "PM2 Documentation", url: "https://pm2.keymetrics.io/docs/usage/quick-start/", description: "Process manager for production Node.js" },
      ]},
    ]},
    { title: "Real-time & Advanced Patterns", classes: [
      { title: "WebSockets & Real-time with Socket.io", desc: "Build real-time features: chat, live notifications, presence indicators using Socket.io with Redis adapter.", refs: [
        { title: "Socket.io Documentation", url: "https://socket.io/docs/v4/", description: "Real-time bidirectional communication" },
      ]},
      { title: "Microservices & Message Queues", desc: "Break monoliths into services, communicate via RabbitMQ/Bull queues, implement saga patterns.", refs: [
        { title: "BullMQ - Job Queue for Node.js", url: "https://docs.bullmq.io/", description: "Redis-based queue for Node.js" },
      ]},
    ]},
  ];

  return buildFromTemplate(allWeeks, numWeeks, audience, topic);
}

function buildReactCourse(n, a, t) { return buildGenericCourse(n, a, t); }
function buildPythonCourse(n, a, t) { return buildGenericCourse(n, a, t); }
function buildJavaScriptCourse(n, a, t) { return buildGenericCourse(n, a, t); }

function buildFullStackCourse(numWeeks, audience, topic) {
  const allWeeks = [
    { title: "HTML, CSS & JavaScript Foundations", classes: [
      { title: "Semantic HTML5 & Responsive CSS", desc: "Build structured, accessible web pages with semantic HTML5, Flexbox, Grid, and media queries.", refs: [
        { title: "MDN: HTML Basics", url: "https://developer.mozilla.org/en-US/docs/Learn/HTML", description: "Complete HTML learning path" },
        { title: "CSS-Tricks: A Complete Guide to Flexbox", url: "https://css-tricks.com/snippets/css/a-guide-to-flexbox/", description: "Visual guide to Flexbox" },
      ]},
      { title: "JavaScript Core Concepts", desc: "Variables, functions, closures, promises, async/await, DOM manipulation, and event handling.", refs: [
        { title: "JavaScript.info", url: "https://javascript.info/", description: "The Modern JavaScript Tutorial" },
        { title: "MDN: JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", description: "Comprehensive JS reference" },
      ]},
    ]},
    { title: "Frontend with React", classes: [
      { title: "React Components, Props & State", desc: "Build reusable UI components, manage state with useState/useReducer, handle effects with useEffect.", refs: [
        { title: "React Official Docs", url: "https://react.dev/learn", description: "React learning guide" },
      ]},
      { title: "Routing, Forms & API Integration", desc: "React Router for navigation, controlled forms with validation, data fetching with SWR/React Query.", refs: [
        { title: "React Router Documentation", url: "https://reactrouter.com/", description: "Client-side routing for React" },
      ]},
    ]},
    { title: "Backend with Node.js & Express", classes: [
      { title: "REST API Design with Express", desc: "RESTful endpoints, middleware, input validation, error handling, and API documentation with Swagger.", refs: [
        { title: "Express.js Guide", url: "https://expressjs.com/en/guide/routing.html", description: "Express routing and middleware" },
      ]},
      { title: "Database Design & Integration", desc: "PostgreSQL schema design, Prisma ORM, migrations, relationships, and query optimization.", refs: [
        { title: "Prisma Docs", url: "https://www.prisma.io/docs", description: "Next-generation ORM for Node.js" },
      ]},
    ]},
    { title: "Auth, Security & Deployment", classes: [
      { title: "Authentication & Authorization", desc: "JWT tokens, bcrypt hashing, role-based access control, OAuth2 basics, and session management.", refs: [
        { title: "Auth0 Blog: JWT Handbook", url: "https://auth0.com/resources/ebooks/jwt-handbook", description: "Comprehensive JWT guide" },
      ]},
      { title: "Deployment & DevOps Basics", desc: "Docker containers, Vercel/Railway deployment, environment variables, CI/CD with GitHub Actions.", refs: [
        { title: "Vercel Documentation", url: "https://vercel.com/docs", description: "Deploy frontend applications" },
      ]},
    ]},
    { title: "Capstone Project", classes: [
      { title: "System Design & Architecture", desc: "Design a full-stack app: database schema, API contracts, component hierarchy, and project planning.", refs: [] },
      { title: "Build, Test & Present", desc: "Implement the full-stack project end-to-end, write tests, and present to the cohort.", refs: [] },
    ]},
  ];

  return buildFromTemplate(allWeeks, numWeeks, audience, topic);
}

function buildGenericCourse(numWeeks, audience, topic) {
  const weeks = [];
  for (let w = 0; w < numWeeks; w++) {
    const weekTitle = w === 0 ? "Foundations & Setup" : w === numWeeks - 1 ? "Capstone & Advanced Topics" : `Core Concepts — Module ${w + 1}`;
    weeks.push({
      number: w + 1,
      title: weekTitle,
      classes: [
        makeClass(1, `${topic}: Theory — Session ${w + 1}.1`, `Core concepts and theory for module ${w + 1}.`, w + 1, numWeeks, topic),
        makeClass(2, `${topic}: Practice — Session ${w + 1}.2`, `Hands-on exercises applying module ${w + 1} concepts.`, w + 1, numWeeks, topic),
      ],
    });
  }
  return {
    title: `${topic} — ${numWeeks}-Week Intensive`,
    description: `A comprehensive ${numWeeks}-week course on ${topic} for ${audience}. Covers fundamentals through advanced topics with coding challenges, quizzes, and projects.`,
    difficulty: numWeeks <= 2 ? "Beginner" : "Intermediate",
    weeks,
  };
}

function buildFromTemplate(allWeeks, numWeeks, audience, topic) {
  const selected = allWeeks.slice(0, numWeeks);
  // If user wants more weeks than template has, pad with generic
  while (selected.length < numWeeks) {
    selected.push({
      title: `Advanced Topics — Module ${selected.length + 1}`,
      classes: [
        { title: `Deep Dive — Session ${selected.length + 1}.1`, desc: "Advanced concepts and patterns.", refs: [] },
        { title: `Workshop — Session ${selected.length + 1}.2`, desc: "Build a project applying advanced concepts.", refs: [] },
      ],
    });
  }

  const weeks = selected.map((w, i) => ({
    number: i + 1,
    title: w.title,
    classes: w.classes.map((cls, ci) =>
      makeClass(ci + 1, cls.title, cls.desc, i + 1, numWeeks, topic, cls.refs)
    ),
  }));

  return {
    title: `${topic} — ${numWeeks}-Week Intensive`,
    description: `A hands-on ${numWeeks}-week course on ${topic} designed for ${audience}. Progresses from fundamentals to production-ready skills with coding challenges, quizzes, and real-world projects.`,
    difficulty: audience.includes("beginner") || audience.includes("intern") ? "Beginner to Intermediate" : "Intermediate to Advanced",
    weeks,
  };
}

function makeClass(num, title, desc, weekNum, totalWeeks, topic, refs) {
  const diff = weekNum <= Math.ceil(totalWeeks / 2) ? "Beginner" : "Intermediate";
  const assignments = [];

  if (num === 1) {
    assignments.push({
      title: `Code: ${title.replace(/—.*/, "").trim()}`,
      description: `Coding exercise for "${title}". ${desc}`,
      type: "coding",
      difficulty: diff,
      hints: ["Start simple, then add complexity", "Test edge cases"],
      pitfalls: ["Don't skip error handling"],
      aha_moment: "Writing code is the fastest way to learn.",
      starter_code: `// ${title}\n// TODO: Implement your solution\n\nfunction solve() {\n  // Your code here\n}\n\nconsole.log(solve());`,
      test_cases: [{ input: "", expected_output: "correct output", description: "Basic test" }],
      rubric: [
        { criterion: "Correctness", excellent: "All cases handled", acceptable: "Core logic works", poor: "Doesn't run", weight: 50 },
        { criterion: "Code Quality", excellent: "Clean and readable", acceptable: "Works but messy", poor: "Hard to follow", weight: 30 },
        { criterion: "Completeness", excellent: "All parts done", acceptable: "Most parts done", poor: "Incomplete", weight: 20 },
      ],
    });
    assignments.push({
      title: `Quiz: ${title.replace(/—.*/, "").trim()}`,
      description: `Test your understanding of "${title}".`,
      type: "objective",
      difficulty: diff,
      questions: [
        { type: "mcq", question: `What is the key concept in "${title}"?`, options: ["The correct fundamental concept", "A common misconception", "An unrelated idea", "A partially correct statement"], correct: 0, explanation: "This is the foundational concept for this module." },
        { type: "mcq", question: `Which best practice applies to "${title}"?`, options: ["Test early and iterate", "Write everything first, test later", "Skip edge cases", "Avoid abstractions"], correct: 0, explanation: "Iterative testing catches issues early." },
      ],
    });
  } else {
    assignments.push({
      title: `Project: ${title.replace(/—.*/, "").trim()}`,
      description: `Build a mini-project for "${title}". ${desc}`,
      type: "ide",
      difficulty: weekNum >= totalWeeks - 1 ? "Advanced" : "Intermediate",
      hints: ["Plan your structure before coding", "Commit often"],
      pitfalls: ["Don't over-engineer the first version"],
      aha_moment: "Connecting all the pieces is where real learning happens.",
      files: [
        { name: "index.html", content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>${title}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <div id="app"><h1>${title}</h1></div>\n  <script src="app.js"></script>\n</body>\n</html>`, language: "html" },
        { name: "app.js", content: `// ${title}\n// TODO: Build your project\n\ndocument.addEventListener('DOMContentLoaded', () => {\n  console.log('Ready');\n});`, language: "javascript" },
        { name: "styles.css", content: `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:system-ui,sans-serif; padding:2rem; }\n#app { max-width:800px; margin:0 auto; }`, language: "css" },
      ],
      test_cases: [{ input: "", expected_output: "Project loads", description: "App runs without errors" }],
      rubric: [
        { criterion: "Functionality", excellent: "All features work", acceptable: "Core features work", poor: "Major bugs", weight: 40 },
        { criterion: "Code Structure", excellent: "Well-organized", acceptable: "Works but messy", poor: "Spaghetti code", weight: 30 },
        { criterion: "UI/UX", excellent: "Polished", acceptable: "Functional", poor: "Broken layout", weight: 30 },
      ],
    });
  }

  return {
    number: num,
    title,
    description: desc,
    assignments,
    references: refs || [
      { title: `${topic} Documentation`, url: "#", description: `Official documentation for ${topic}` },
      { title: `${topic} Best Practices`, url: "#", description: `Community best practices and patterns` },
    ],
  };
}

module.exports = { chatWithGemini, generateCourse };
