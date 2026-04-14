// Legacy runner — now delegates to Judge0.
// All callers (routes/trainee.js, services/grading.js) keep working unchanged;
// execution has moved off local execFile onto the sandboxed Judge0 API.

const judge0 = require("./judge0");

function runCode(code, language, timeout = 10) {
  return judge0.runCode(code, language, "", timeout);
}

// Back-compat shims — old code paths that specifically called the Python/Node variants.
function runPythonCode(code, timeout = 10) {
  return judge0.runCode(code, "python", "", timeout);
}

function runNodeCode(code, timeout = 10) {
  return judge0.runCode(code, "javascript", "", timeout);
}

module.exports = { runCode, runPythonCode, runNodeCode };
