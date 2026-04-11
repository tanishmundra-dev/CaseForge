function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(arr, k) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, k);
}

async function gradeSubmission(assignment, code, execResult) {
  await sleep(1500);

  const codeLen = code.trim().length;
  const hasOutput = !!(execResult && (execResult.stdout || "").trim());
  const hasError = !!(execResult && (execResult.stderr || "").trim());

  let baseScore;
  if (codeLen < 50) {
    baseScore = randInt(30, 45);
  } else if (codeLen < 200) {
    baseScore = randInt(55, 72);
  } else {
    baseScore = randInt(74, 95);
  }

  if (hasOutput && !hasError) {
    baseScore = Math.min(100, baseScore + 5);
  } else if (hasError) {
    baseScore = Math.max(0, baseScore - 10);
  }

  const rubric = assignment.rubric || [];
  const criterionScores = rubric.map((item) => {
    const variance = randInt(-8, 8);
    const score = Math.max(0, Math.min(100, baseScore + variance));
    let level;
    if (score >= 80) level = "Excellent";
    else if (score >= 60) level = "Acceptable";
    else level = "Poor";

    const feedbackMap = {
      Excellent: [
        "Strong implementation that demonstrates clear understanding.",
        "Well-executed with attention to edge cases.",
        "Impressive work — goes beyond the basics.",
      ],
      Acceptable: [
        "Functional but could be more robust.",
        "The core idea is right, but details need polish.",
        "Works for the happy path — consider edge cases.",
      ],
      Poor: [
        "This section needs significant rework.",
        "Missing key implementation details.",
        "The approach doesn't meet the requirements yet.",
      ],
    };

    const options = feedbackMap[level];
    return {
      criterion: item.criterion || "Unknown",
      score,
      level,
      feedback: options[randInt(0, options.length - 1)],
    };
  });

  const avg =
    criterionScores.length > 0
      ? criterionScores.reduce((sum, cs) => sum + cs.score, 0) /
        criterionScores.length
      : baseScore;
  const overall = Math.round(avg);

  let grade;
  if (overall >= 90) grade = "A";
  else if (overall >= 85) grade = "A-";
  else if (overall >= 80) grade = "B+";
  else if (overall >= 75) grade = "B";
  else if (overall >= 70) grade = "B-";
  else if (overall >= 65) grade = "C+";
  else if (overall >= 60) grade = "C";
  else if (overall >= 50) grade = "D";
  else grade = "F";

  const strengthsPool = [
    "Good understanding of the core concepts",
    "Clean separation of concerns",
    "Correct use of Python standard library",
    "Solid grasp of container fundamentals",
    "Nice use of error handling in key sections",
  ];
  const improvementsPool = [
    "Add error handling for edge cases",
    "Consider container-specific behavior",
    "Add logging for production debugging",
    "Optimize for minimal resource usage",
    "Add input validation and type hints",
  ];

  let execNote = "";
  if (execResult) {
    if (hasOutput && !hasError) {
      execNote = " Code executed successfully.";
    } else if (hasError) {
      execNote = " Code had errors during execution.";
    }
  }

  let overallFeedback;
  if (overall >= 75) {
    overallFeedback = "Strong submission demonstrating solid understanding.";
  } else if (overall >= 60) {
    overallFeedback = "Decent attempt with room for improvement.";
  } else {
    overallFeedback = "This submission needs significant work.";
  }

  return {
    overall_score: overall,
    grade,
    criterion_scores: criterionScores,
    overall_feedback: `${overallFeedback}${execNote} Overall score: ${overall}/100.`,
    strengths: sample(strengthsPool, 2),
    improvements: sample(improvementsPool, 2),
  };
}

async function companionChat(messages, assignment, code) {
  await sleep(500);

  const lastMsg =
    messages.length > 0 ? messages[messages.length - 1].content.toLowerCase() : "";

  if (lastMsg.includes("docker") || lastMsg.includes("container")) {
    return {
      content:
        "Good question! Remember that containers are isolated processes — they have their own filesystem, network, and process tree. Think about what that means for your code: environment variables, hostnames, and file paths all change.",
    };
  } else if (
    lastMsg.includes("kubernetes") ||
    lastMsg.includes("k8s") ||
    lastMsg.includes("pod")
  ) {
    return {
      content:
        "With Kubernetes, think declaratively — you describe the desired state, and K8s makes it happen. The key resources are: Pods (smallest unit), Deployments (manage replicas), and Services (expose Pods to network traffic).",
    };
  } else if (lastMsg.includes("yaml") || lastMsg.includes("manifest")) {
    return {
      content:
        "Every K8s manifest needs four things: apiVersion, kind, metadata (with name and labels), and spec. Get those right and you're 80% there. Labels are how K8s connects resources to each other.",
    };
  } else if (
    lastMsg.includes("help") ||
    lastMsg.includes("stuck") ||
    lastMsg.includes("start")
  ) {
    return {
      content:
        "Start with the simplest version that works. Get the basic structure right, run it, then add complexity. The assignments are designed to build on each other — don't skip ahead!",
    };
  } else if (
    lastMsg.includes("error") ||
    lastMsg.includes("bug") ||
    lastMsg.includes("fix")
  ) {
    return {
      content:
        "Try running your code first to see the exact error. Common issues: missing imports, wrong variable names, or forgetting to call the function. The error message usually tells you exactly where to look.",
    };
  } else if (lastMsg.includes("test") || lastMsg.includes("run")) {
    return {
      content:
        "Use the Run Code button to execute your solution. Check the output panel for stdout (green) and stderr (red). The test cases show you what output is expected.",
    };
  } else {
    return {
      content:
        "That's a great question! Think about the specific problem the assignment is asking you to solve. What's the core logic needed? Start there, and let the hints guide you if you get stuck.",
    };
  }
}

module.exports = { gradeSubmission, companionChat };
