const { GoogleGenerativeAI } = require("@google/generative-ai");
const { runCode } = require("./codeRunner");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════
// TEST CASE RUNNER — executes student code against each test case
// ═══════════════════════════════════════════════════════════

async function runTestCases(code, testCases, language) {
  if (!testCases || testCases.length === 0) return { passed: 0, total: 0, results: [] };

  const results = [];
  let passed = 0;

  for (const tc of testCases) {
    // Inject test input into the code if the test case has input
    let testCode = code;
    if (tc.input && tc.input.trim()) {
      // Append a test call at the end of the student's code
      if (language === "javascript" || language === "node") {
        testCode += `\n\n// AUTO-TEST\nconsole.log(solve(${tc.input}));`;
      } else {
        testCode += `\n\n# AUTO-TEST\nif __name__ == '__main__':\n    print(solve(${tc.input}))`;
      }
    }

    const exec = await runCode(testCode, language, 8);
    const actual = (exec.stdout || "").trim();
    const expected = (tc.expected_output || "").trim();
    const match = actual === expected || actual.includes(expected);

    results.push({
      description: tc.description || "Test case",
      input: tc.input || "",
      expected: expected,
      actual: actual,
      error: exec.stderr || "",
      passed: match && !exec.stderr,
    });

    if (match && !exec.stderr) passed++;
  }

  return { passed, total: testCases.length, results };
}

// ═══════════════════════════════════════════════════════════
// AI GRADING — Gemini analyzes code quality + rubric scoring
// ═══════════════════════════════════════════════════════════

async function aiGrade(assignment, code, execResult, testResults) {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2000,
      temperature: 0.3,
    },
  });

  const rubric = assignment.rubric || [];
  const rubricText = rubric.length > 0
    ? rubric.map((r) => `- ${r.criterion} (weight: ${r.weight}%): Excellent="${r.excellent}", Acceptable="${r.acceptable}", Poor="${r.poor}"`).join("\n")
    : "- Correctness (weight: 50%)\n- Code Quality (weight: 50%)";

  const testSummary = testResults.total > 0
    ? `Test cases: ${testResults.passed}/${testResults.total} passed\n${testResults.results.map((r) => `  ${r.passed ? "PASS" : "FAIL"}: ${r.description} | expected="${r.expected}" got="${r.actual}" ${r.error ? "error=" + r.error.slice(0, 100) : ""}`).join("\n")}`
    : "No test cases defined.";

  const prompt = `You are a strict but fair code grading engine. Analyze this student submission and grade it.

ASSIGNMENT: "${assignment.title}"
Description: ${(assignment.description || "").slice(0, 500)}
Type: ${assignment.type || "coding"}
Difficulty: ${assignment.difficulty || "Intermediate"}

STUDENT'S CODE:
\`\`\`
${code.slice(0, 3000)}
\`\`\`

EXECUTION RESULT:
stdout: ${(execResult.stdout || "").slice(0, 500)}
stderr: ${(execResult.stderr || "").slice(0, 500)}
exit_code: ${execResult.exit_code ?? "unknown"}

${testSummary}

RUBRIC:
${rubricText}

Grade this submission. Return JSON:
{
  "criterion_scores": [
    {"criterion": "Criterion Name", "score": 0-100, "level": "Excellent|Acceptable|Poor", "feedback": "specific feedback for this criterion referencing their actual code"}
  ],
  "overall_feedback": "2-3 sentences analyzing the submission — mention specific strengths and issues in their code",
  "strengths": ["specific strength 1", "specific strength 2"],
  "improvements": ["specific actionable improvement 1", "specific actionable improvement 2"]
}

GRADING RULES:
- If ALL test cases pass: minimum 70 for Correctness criterion
- If NO test cases pass: maximum 40 for Correctness criterion
- If code has runtime errors: maximum 50 overall
- If code is empty or trivial (<20 chars): maximum 20 overall
- Reference SPECIFIC lines/patterns in their code in feedback
- Match criterion names and weights from the rubric above
- Be specific, not generic — mention actual variable names, functions, patterns`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const text = result.response.text().trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      const clean = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      try { parsed = JSON.parse(clean); } catch { return null; }
    }
    return parsed;
  } catch (err) {
    console.error("AI grading error:", err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN GRADING FUNCTION — combines test execution + AI analysis
// ═══════════════════════════════════════════════════════════

async function gradeSubmission(assignment, code, execResult) {
  const language = detectLanguage(assignment, code);
  const testCases = assignment.test_cases || [];

  // Step 1: Run test cases
  const testResults = await runTestCases(code, testCases, language);

  // Step 2: Calculate base score from test results
  let testScore = 0;
  if (testResults.total > 0) {
    testScore = Math.round((testResults.passed / testResults.total) * 100);
  } else {
    // No test cases — base on execution success
    const hasOutput = !!(execResult && (execResult.stdout || "").trim());
    const hasError = !!(execResult && (execResult.stderr || "").trim());
    testScore = hasOutput && !hasError ? 70 : hasError ? 30 : 50;
  }

  // Step 3: AI grading via Gemini
  const aiResult = await aiGrade(assignment, code, execResult, testResults);

  // Step 4: Combine results
  if (aiResult && aiResult.criterion_scores && aiResult.criterion_scores.length > 0) {
    // Use AI-scored criteria
    const rubric = assignment.rubric || [];
    const criterionScores = aiResult.criterion_scores.map((cs) => {
      const rubricItem = rubric.find((r) => r.criterion === cs.criterion);
      return {
        criterion: cs.criterion,
        score: Math.max(0, Math.min(100, cs.score)),
        weight: rubricItem?.weight || Math.round(100 / aiResult.criterion_scores.length),
        level: cs.level || (cs.score >= 80 ? "Excellent" : cs.score >= 60 ? "Acceptable" : "Poor"),
        feedback: cs.feedback || "",
      };
    });

    // Weighted average
    const totalWeight = criterionScores.reduce((sum, cs) => sum + (cs.weight || 0), 0);
    const weightedSum = criterionScores.reduce((sum, cs) => sum + cs.score * (cs.weight || 0), 0);
    const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : testScore;

    return {
      overall_score: overall,
      grade: scoreToGrade(overall),
      criterion_scores: criterionScores,
      overall_feedback: aiResult.overall_feedback || `Score: ${overall}/100.`,
      strengths: aiResult.strengths || [],
      improvements: aiResult.improvements || [],
      test_results: testResults,
    };
  }

  // Fallback: test-score based grading (if AI fails)
  const rubric = assignment.rubric || [
    { criterion: "Correctness", weight: 60 },
    { criterion: "Code Quality", weight: 40 },
  ];

  const hasError = !!(execResult && (execResult.stderr || "").trim());
  const criterionScores = rubric.map((item) => {
    let score;
    if (item.criterion.toLowerCase().includes("correct")) {
      score = testScore;
    } else {
      score = hasError ? Math.max(20, testScore - 20) : Math.min(100, testScore + 10);
    }
    return {
      criterion: item.criterion || "General",
      score,
      weight: item.weight || 50,
      level: score >= 80 ? "Excellent" : score >= 60 ? "Acceptable" : "Poor",
      feedback: score >= 80 ? "Solid work." : score >= 60 ? "Adequate but could improve." : "Needs revision.",
    };
  });

  const totalWeight = criterionScores.reduce((sum, cs) => sum + cs.weight, 0);
  const weightedSum = criterionScores.reduce((sum, cs) => sum + cs.score * cs.weight, 0);
  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : testScore;

  return {
    overall_score: overall,
    grade: scoreToGrade(overall),
    criterion_scores: criterionScores,
    overall_feedback: `${testResults.total > 0 ? `${testResults.passed}/${testResults.total} test cases passed.` : "Code executed."} ${hasError ? "Runtime errors detected." : ""} Score: ${overall}/100.`,
    strengths: testResults.passed > 0 ? ["Some test cases pass correctly"] : ["Code submitted"],
    improvements: testResults.passed < testResults.total ? ["Fix failing test cases"] : ["Review edge cases"],
    test_results: testResults,
  };
}

function scoreToGrade(score) {
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

function detectLanguage(assignment, code) {
  const title = (assignment.title || "").toLowerCase();
  const desc = (assignment.description || "").toLowerCase();
  if (title.includes("javascript") || title.includes("node") || title.includes("js") || desc.includes("javascript")) return "javascript";
  if (code.includes("console.log") || code.includes("function ") || code.includes("const ") || code.includes("let ")) return "javascript";
  return "python";
}

module.exports = { gradeSubmission };
