// services/judge0.js
// Code execution service for CaseForge — uses Judge0 CE via RapidAPI.
//
// Required env vars:
//   RAPIDAPI_KEY        — your RapidAPI key
//   JUDGE0_API_URL      — (optional) defaults to https://judge0-ce.p.rapidapi.com
//   RAPIDAPI_HOST       — (optional) defaults to judge0-ce.p.rapidapi.com

require("dotenv").config();

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || "https://judge0-ce.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "judge0-ce.p.rapidapi.com";

// Judge0 CE language IDs
// Full list: GET /languages on the API
const LANGUAGE_MAP = {
  javascript: { id: 63, ext: ".js" },   // Node.js 12.14.0
  js:         { id: 63, ext: ".js" },
  node:       { id: 63, ext: ".js" },
  nodejs:     { id: 63, ext: ".js" },
  python:     { id: 71, ext: ".py" },   // Python 3.8.1
  python3:    { id: 71, ext: ".py" },
  py:         { id: 71, ext: ".py" },
  java:       { id: 62, ext: ".java" }, // Java (OpenJDK 13.0.1)
  cpp:        { id: 54, ext: ".cpp" },  // C++ (GCC 9.2.0)
  c:          { id: 50, ext: ".c" },    // C (GCC 9.2.0)
  typescript: { id: 74, ext: ".ts" },   // TypeScript 3.7.4
  go:         { id: 60, ext: ".go" },   // Go 1.13.5
  rust:       { id: 73, ext: ".rs" },   // Rust 1.40.0
  ruby:       { id: 72, ext: ".rb" },   // Ruby 2.7.0
};

// Judge0 status IDs
const STATUS = {
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
};

/**
 * Build request headers for Judge0 RapidAPI.
 */
function getHeaders() {
  return {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };
}

/**
 * Submit code to Judge0 and return the result.
 * Uses ?wait=true for synchronous execution (blocks until done).
 * Falls back to polling if the wait times out.
 */
async function submitToJudge0(sourceCode, languageId, stdin = "", cpuTimeLimit = 5) {
  const payload = {
    source_code: sourceCode,
    language_id: languageId,
    stdin: stdin,
    cpu_time_limit: cpuTimeLimit,
    wall_time_limit: cpuTimeLimit * 2,
    memory_limit: 128000, // 128 MB in KB
  };

  // Try synchronous submission first (wait=true)
  const res = await fetch(
    `${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 API error (${res.status}): ${text}`);
  }

  let data = await res.json();

  // If still processing (wait timed out), poll for result
  if (data.status && (data.status.id === STATUS.IN_QUEUE || data.status.id === STATUS.PROCESSING)) {
    data = await pollResult(data.token);
  }

  return data;
}

/**
 * Poll Judge0 for a submission result until it's done.
 */
async function pollResult(token, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));

    const res = await fetch(
      `${JUDGE0_API_URL}/submissions/${token}?base64_encoded=false`,
      { headers: getHeaders() }
    );

    if (!res.ok) continue;
    const data = await res.json();

    if (data.status && data.status.id > STATUS.PROCESSING) {
      return data;
    }
  }
  throw new Error("Judge0 submission timed out after polling");
}

/**
 * Map Judge0 status to a simple status string.
 */
function mapStatus(statusObj) {
  if (!statusObj) return "Internal Error";
  const id = statusObj.id;
  if (id === STATUS.ACCEPTED) return "Accepted";
  if (id === STATUS.TIME_LIMIT) return "Time Limit Exceeded";
  if (id === STATUS.COMPILATION_ERROR) return "Compilation Error";
  if (id >= 7 && id <= 12) return "Runtime Error";
  if (id === STATUS.INTERNAL_ERROR) return "Internal Error";
  return statusObj.description || "Unknown Error";
}

/**
 * Run code freely -- for "Run Code" button.
 * Returns { stdout, stderr, exit_code, status, time, memory }.
 */
async function runCode(code, language, stdin = "", timeLimit = 10) {
  if (!RAPIDAPI_KEY) {
    return { stdout: "", stderr: "RAPIDAPI_KEY is not configured", exit_code: 1, status: "Internal Error" };
  }

  const lang = (language || "javascript").toLowerCase();
  const langInfo = LANGUAGE_MAP[lang];
  if (!langInfo) {
    return { stdout: "", stderr: `Unsupported language: ${language}`, exit_code: 1, status: "Internal Error" };
  }

  try {
    const data = await submitToJudge0(code, langInfo.id, stdin, timeLimit);

    return {
      stdout: data.stdout || "",
      stderr: data.stderr || data.compile_output || "",
      exit_code: data.status?.id === STATUS.ACCEPTED ? 0 : 1,
      status: mapStatus(data.status),
      time: data.time || null,
      memory: data.memory || null,
    };
  } catch (err) {
    return {
      stdout: "",
      stderr: err.message,
      exit_code: 1,
      status: "Internal Error",
    };
  }
}

/**
 * Run code against test cases -- for "Submit" button.
 * Generates a wrapper that imports the student's function, calls it with each test input,
 * and compares the output. All executed inside Judge0's sandbox.
 */
async function runTests(code, language, testCases, functionName, timeLimit = 15) {
  if (!testCases || testCases.length === 0) {
    const result = await runCode(code, language, "", timeLimit);
    return {
      test_results: [],
      passed: 0,
      total: 0,
      all_passed: false,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  const lang = (language || "javascript").toLowerCase();
  const isJS = ["javascript", "js", "node", "nodejs"].includes(lang);
  const isPython = ["python", "python3", "py"].includes(lang);
  const fnName = functionName || detectFunctionName(code, isJS);

  let testScript;
  if (isJS) {
    testScript = generateJSTestScript(code, fnName, testCases);
  } else if (isPython) {
    testScript = generatePyTestScript(code, fnName, testCases);
  } else {
    const result = await runCode(code, language, "", timeLimit);
    return {
      test_results: [],
      passed: 0,
      total: 0,
      all_passed: false,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  const result = await runCode(testScript, language, "", timeLimit);

  const stdout = result.stdout || "";
  const marker = stdout.lastIndexOf("===RESULTS===");

  if (marker === -1) {
    return {
      test_results: testCases.map((tc, i) => ({
        test: i + 1,
        description: tc.description || `Test ${i + 1}`,
        input: tc.is_hidden ? "hidden" : tc.input,
        expected: tc.is_hidden ? "hidden" : tc.expected_output,
        actual: "ERROR: " + (result.stderr || "Execution failed").slice(0, 200),
        passed: false,
      })),
      passed: 0,
      total: testCases.length,
      all_passed: false,
      stdout: stdout,
      stderr: result.stderr,
      time: result.time,
      memory: result.memory,
    };
  }

  const studentOutput = stdout.slice(0, marker).trim();
  let testResults;
  try {
    testResults = JSON.parse(stdout.slice(marker + 13).trim());
  } catch {
    testResults = [];
  }

  const passed = testResults.filter((r) => r.passed).length;
  return {
    test_results: testResults,
    passed,
    total: testResults.length,
    all_passed: passed === testResults.length,
    stdout: studentOutput,
    stderr: result.stderr || "",
    time: result.time,
    memory: result.memory,
  };
}

// -- Helpers --

function detectFunctionName(code, isJS) {
  if (isJS) {
    const m = code.match(/function\s+(\w+)\s*\(/) ||
              code.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/);
    return m ? m[1] : "solve";
  }
  const m = code.match(/def\s+(\w+)\s*\(/);
  return m ? m[1] : "solve";
}

function generateJSTestScript(studentCode, fnName, testCases) {
  const tests = testCases.map((tc, i) => {
    const input = JSON.stringify(tc.input);
    const expected = JSON.stringify(tc.expected_output);
    const hidden = tc.is_hidden || false;
    const desc = JSON.stringify(tc.description || `Test ${i + 1}`);

    return `
  try {
    const raw = ${input};
    const exp = String(${expected}).trim();
    let act;
    if (raw === "" || raw == null) { act = String(${fnName}()).trim(); }
    else {
      try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        act = Array.isArray(parsed) ? String(${fnName}(...parsed)).trim() : String(${fnName}(parsed)).trim();
      } catch { act = String(${fnName}(raw)).trim(); }
    }
    let passed = act === exp;
    if (!passed) { try { passed = Math.abs(parseFloat(act) - parseFloat(exp)) < 0.001; } catch {} }
    R.push({test:${i + 1},description:${desc},input:${JSON.stringify(hidden ? "hidden" : tc.input)},expected:${JSON.stringify(hidden ? "hidden" : tc.expected_output)},actual:${hidden}&&!passed?"hidden":act,passed});
  } catch(e) {
    R.push({test:${i + 1},description:${desc},input:${JSON.stringify(hidden ? "hidden" : tc.input)},expected:${JSON.stringify(hidden ? "hidden" : tc.expected_output)},actual:"ERROR: "+e.message,passed:false});
  }`;
  }).join("\n");

  return `// -- Student Code --
${studentCode}

// -- Test Runner --
const R = [];
${tests}
console.log("===RESULTS===" + JSON.stringify(R));
`;
}

function generatePyTestScript(studentCode, fnName, testCases) {
  const tests = testCases.map((tc, i) => {
    const input = JSON.stringify(tc.input);
    const expected = JSON.stringify(tc.expected_output);
    const hidden = tc.is_hidden || false;
    const desc = JSON.stringify(tc.description || `Test ${i + 1}`);

    return `
try:
    raw = ${input}
    exp = str(${expected}).strip()
    if raw == "" or raw is None:
        act = str(${fnName}()).strip()
    else:
        try:
            p = eval(str(raw))
            act = str(${fnName}(*p)).strip() if isinstance(p, tuple) else str(${fnName}(p)).strip()
        except:
            act = str(${fnName}(raw)).strip()
    passed = act == exp
    if not passed:
        try: passed = abs(float(act) - float(exp)) < 0.001
        except: pass
    R.append({"test":${i + 1},"description":${desc},"input":${JSON.stringify(hidden ? "hidden" : tc.input)},"expected":${JSON.stringify(hidden ? "hidden" : tc.expected_output)},"actual":"hidden" if ${hidden ? "True" : "False"} and not passed else act,"passed":passed})
except Exception as e:
    R.append({"test":${i + 1},"description":${desc},"input":${JSON.stringify(hidden ? "hidden" : tc.input)},"expected":${JSON.stringify(hidden ? "hidden" : tc.expected_output)},"actual":"ERROR: "+str(e),"passed":False})`;
  }).join("\n");

  return `import json

# -- Student Code --
${studentCode}

# -- Test Runner --
R = []
${tests}
print("===RESULTS===" + json.dumps(R))
`;
}

/**
 * Get available languages from Judge0
 */
async function getLanguages() {
  if (!RAPIDAPI_KEY) return [];
  try {
    const res = await fetch(`${JUDGE0_API_URL}/languages`, { headers: getHeaders() });
    if (!res.ok) return [];
    const languages = await res.json();
    return languages.map((l) => ({ id: l.id, name: l.name }));
  } catch {
    return [];
  }
}

/**
 * Check if Judge0 RapidAPI is reachable
 */
async function healthCheck() {
  if (!RAPIDAPI_KEY) {
    return { healthy: false, error: "RAPIDAPI_KEY is not configured" };
  }
  try {
    const res = await fetch(`${JUDGE0_API_URL}/statuses`, { headers: getHeaders() });
    if (!res.ok) {
      return { healthy: false, error: `HTTP ${res.status} from Judge0 API` };
    }
    const statuses = await res.json();
    return {
      healthy: true,
      engine: "judge0-ce-rapidapi",
      statuses: statuses.length,
      url: JUDGE0_API_URL,
    };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

module.exports = { runCode, runTests, getLanguages, healthCheck, LANGUAGE_MAP };
