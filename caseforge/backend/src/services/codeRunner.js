const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function runPythonCode(code, timeout = 10) {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), `caseforge_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code);

    execFile(
      "python",
      [tmpFile],
      { timeout: timeout * 1000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
      (error, stdout, stderr) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tmpFile);
        } catch (_) {}

        if (error && error.killed) {
          resolve({
            stdout: "",
            stderr: `Execution timed out after ${timeout} seconds.`,
            exit_code: -1,
          });
        } else if (error) {
          resolve({
            stdout: stdout || "",
            stderr: stderr || error.message,
            exit_code: error.code || -1,
          });
        } else {
          resolve({
            stdout: stdout || "",
            stderr: stderr || "",
            exit_code: 0,
          });
        }
      }
    );
  });
}

module.exports = { runPythonCode };
