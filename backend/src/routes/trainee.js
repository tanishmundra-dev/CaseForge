const express = require("express");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../supabase");
const { gradeSubmission } = require("../services/grading");
const { runPythonCode, runCode } = require("../services/codeRunner");
const { callLLMRaw } = require("../services/llm-feedback");
const { smartCompanionChat } = require("../services/companion");
const { authMiddleware, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// All trainee routes use optional auth (extracts user if token present)
router.use(optionalAuth);

// ── Course browsing (enrolled + published only) ──

router.get("/courses", async (req, res) => {
  const studentId = req.user?.id || null;

  // If authenticated, only show enrolled courses
  let courseFilter = null;
  if (studentId) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("student_id", studentId);
    if (enrollments && enrollments.length > 0) {
      courseFilter = enrollments.map((e) => e.course_id);
    }
  }

  let query = supabase.from("courses").select("*").eq("status", "published");
  if (courseFilter) {
    query = query.in("id", courseFilter);
  }
  const { data: courses } = await query;

  const result = [];
  for (const c of courses || []) {
    const { data: weeks } = await supabase
      .from("weeks")
      .select("id")
      .eq("course_id", c.id);
    const weekIds = (weeks || []).map((w) => w.id);

    let classCount = 0;
    if (weekIds.length > 0) {
      const { count } = await supabase
        .from("classes")
        .select("*", { count: "exact", head: true })
        .in("week_id", weekIds);
      classCount = count || 0;
    }

    result.push({
      id: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      status: c.status,
      week_count: (weeks || []).length,
      class_count: classCount,
    });
  }

  res.json(result);
});

router.get("/courses/:courseId", async (req, res) => {
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("*")
    .eq("id", req.params.courseId)
    .maybeSingle();
  if (courseErr || !course) return res.status(404).json({ error: "Course not found" });

  // Build nested object
  const { data: weeks } = await supabase
    .from("weeks")
    .select("*")
    .eq("course_id", course.id)
    .order("number");

  const weekIds = (weeks || []).map((w) => w.id);
  let classes = [];
  if (weekIds.length > 0) {
    const { data } = await supabase
      .from("classes")
      .select("*")
      .in("week_id", weekIds)
      .order("number");
    classes = data || [];
  }

  const classIds = classes.map((c) => c.id);
  let assignments = [];
  if (classIds.length > 0) {
    const { data } = await supabase
      .from("assignments")
      .select("*")
      .in("class_id", classIds);
    assignments = data || [];
  }

  const classMap = {};
  for (const cls of classes) {
    classMap[cls.id] = { ...cls, assignments: [] };
    delete classMap[cls.id].week_id;
  }
  for (const asn of assignments) {
    const cid = asn.class_id;
    delete asn.class_id;
    if (classMap[cid]) classMap[cid].assignments.push(asn);
  }

  const weekList = (weeks || []).map((w) => {
    const weekClasses = classes
      .filter((c) => c.week_id === w.id)
      .map((c) => classMap[c.id]);
    return { id: w.id, number: w.number, title: w.title, classes: weekClasses };
  });

  res.json({ ...course, weeks: weekList });
});

router.get("/courses/:courseId/classes/:classId", async (req, res) => {
  const { courseId, classId } = req.params;

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return res.json({ error: "Course not found" });

  // Find the class and its week
  const { data: cls } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .maybeSingle();
  if (!cls) return res.json({ error: "Class not found" });

  const { data: week } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", cls.week_id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!week) return res.json({ error: "Class not found" });

  const { data: assignments } = await supabase
    .from("assignments")
    .select("*")
    .eq("class_id", classId);

  const cleanAssignments = (assignments || []).map((a) => {
    const { class_id, ...rest } = a;
    return rest;
  });

  res.json({
    course_id: course.id,
    course_title: course.title,
    week_number: week.number,
    week_title: week.title,
    id: cls.id,
    number: cls.number,
    title: cls.title,
    description: cls.description,
    theory_content: cls.theory_content || "",
    learning_units: cls.learning_units || [],
    resource_links: cls.resource_links || [],
    assignments: cleanAssignments,
  });
});

router.get(
  "/courses/:courseId/classes/:classId/assignments/:assignmentId",
  async (req, res) => {
    const { courseId, classId, assignmentId } = req.params;

    const { data: course } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) return res.json({ error: "Course not found" });

    const { data: cls } = await supabase
      .from("classes")
      .select("*")
      .eq("id", classId)
      .maybeSingle();
    if (!cls) return res.json({ error: "Class not found" });

    const { data: week } = await supabase
      .from("weeks")
      .select("*")
      .eq("id", cls.week_id)
      .maybeSingle();

    const { data: assignment } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .eq("class_id", classId)
      .maybeSingle();
    if (!assignment) return res.json({ error: "Assignment not found" });

    const { class_id, solution_code, ...asnData } = assignment;

    res.json({
      course_id: course.id,
      course_title: course.title,
      week_number: week ? week.number : null,
      class_id: cls.id,
      class_number: cls.number,
      class_title: cls.title,
      ...asnData,
    });
  }
);

// ── Get Solution (explicit request only) ──

router.get("/assignments/:assignmentId/solution", async (req, res) => {
  const { data: assignment } = await supabase
    .from("assignments")
    .select("solution_code, title")
    .eq("id", req.params.assignmentId)
    .maybeSingle();

  if (!assignment) return res.status(404).json({ error: "Assignment not found" });

  res.json({
    solution_code: assignment.solution_code || "// No solution available for this assignment.",
    title: assignment.title,
  });
});

// ── Code execution ──

router.post("/run", async (req, res) => {
  const code = req.body.code || "";
  const language = req.body.language || "python";
  const result = await runCode(code, language, 10);
  res.json(result);
});

// ── Submission / Grading ──

router.post("/submit", async (req, res) => {
  const { course_id, class_id, assignment_id, code, trainee_name, assignment_type, score, grade, answers, language } = req.body;

  // Resolve student identity from auth token (fallback to body for backwards compat)
  const studentId = req.user?.id || null;
  const studentName = req.user?.name || trainee_name || "Demo Trainee";

  // ── Quiz / Objective submissions (no code execution needed) ──
  if (assignment_type === "objective") {
    const submission = {
      id: `sub-${uuidv4().slice(0, 6)}`,
      course_id: course_id || "",
      class_id: class_id || "",
      assignment_id: assignment_id || "",
      student_id: studentId,
      trainee_name: studentName,
      code: JSON.stringify(answers || {}),
      execution_output: "",
      overall_score: score || 0,
      grade: grade || "",
      criterion_scores: [],
      overall_feedback: score >= 70 ? "Good understanding of the concepts." : score >= 40 ? "Decent attempt — review the explanations." : "Needs more study. Review the material.",
      strengths: [],
      improvements: [],
      submitted_at: new Date().toISOString(),
    };

    let { error } = await supabase.from("submissions").insert(submission);
    // Fallback: retry without student_id if column doesn't exist yet
    if (error && error.message.includes("student_id")) {
      delete submission.student_id;
      ({ error } = await supabase.from("submissions").insert(submission));
    }
    if (error) return res.status(500).json({ error: error.message });
    return res.json(submission);
  }

  // ── Coding / IDE submissions ──
  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignment_id || "")
    .eq("class_id", class_id || "")
    .maybeSingle();

  if (!assignment) return res.json({ error: "Assignment not found" });

  const execResult = await runCode(code || "", language || "python", 10);
  const result = await gradeSubmission(assignment, code || "", execResult);

  const submission = {
    id: `sub-${uuidv4().slice(0, 6)}`,
    course_id: course_id || "",
    class_id: class_id || "",
    assignment_id: assignment_id || "",
    student_id: studentId,
    trainee_name: studentName,
    code: code || "",
    execution_output: (execResult.stdout || "") + (execResult.stderr || ""),
    ...result,
    submitted_at: new Date().toISOString(),
  };

  let { error } = await supabase.from("submissions").insert(submission);
  // Fallback: retry without student_id if column doesn't exist yet
  if (error && error.message.includes("student_id")) {
    delete submission.student_id;
    ({ error } = await supabase.from("submissions").insert(submission));
  }
  if (error) return res.status(500).json({ error: error.message });

  res.json(submission);
});

// ── Companion Chat ──

router.post("/companion/chat", async (req, res) => {
  try {
    const result = await smartCompanionChat(
      req.body.messages,
      req.body.assignment,
      req.body.current_code || ""
    );
    res.json(result);
  } catch (err) {
    console.error("Companion error:", err.message);
    res.json({ content: "I'm having trouble right now. Try again in a moment." });
  }
});

// ── Progress ──

router.get("/progress", async (req, res) => {
  const studentId = req.user?.id || null;
  const studentName = req.user?.name || "Demo Trainee";

  const { data: allSubs } = await supabase.from("submissions").select("*");
  const subs = allSubs || [];

  // Match by student_id OR trainee_name (handles both old and new submissions)
  const mine = subs.filter((s) =>
    (studentId && s.student_id === studentId) || s.trainee_name === studentName
  );

  // Enrollment-aware: count courses this student is enrolled in
  let enrolledCount = 0;
  if (studentId) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("student_id", studentId);
    enrolledCount = (enrollments || []).length;
  } else {
    const { data: courses } = await supabase.from("courses").select("id").eq("status", "published");
    enrolledCount = (courses || []).length;
  }

  // Build per-student average scores for ranking
  const studentScores = {};
  for (const s of subs) {
    const key = s.student_id || s.trainee_name;
    if (!studentScores[key]) studentScores[key] = { name: s.trainee_name, total: 0, count: 0 };
    studentScores[key].total += s.overall_score;
    studentScores[key].count++;
  }
  const ranked = Object.entries(studentScores)
    .map(([key, v]) => ({ key, name: v.name, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg);

  const myKey = studentId || studentName;
  const rank = ranked.findIndex((r) => r.key === myKey) + 1 || ranked.length + 1;

  const avgScore = mine.length > 0
    ? Math.round(mine.reduce((sum, s) => sum + s.overall_score, 0) / mine.length)
    : 0;

  res.json({
    courses_enrolled: enrolledCount,
    completed: mine.length,
    avg_score: avgScore,
    rank,
    total: ranked.length,
    submissions: mine,
    leaderboard: ranked.slice(0, 10).map((r, i) => ({
      name: r.name,
      score: r.avg,
      rank: i + 1,
    })),
  });
});

// ── AI Feedback (Gemini-powered performance analysis) ──

router.post("/feedback", async (req, res) => {
  const { submission_id } = req.body;
  const studentId = req.user?.id || null;
  const studentName = req.user?.name || "Student";

  // Get the specific submission
  const { data: sub } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submission_id || "")
    .maybeSingle();
  if (!sub) return res.status(404).json({ error: "Submission not found" });

  // Get assignment details for context
  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", sub.assignment_id)
    .maybeSingle();

  try {
    const feedback = await callLLMRaw(sub, assignment, studentName);
    res.json(feedback);
  } catch (err) {
    console.error("Feedback error:", err.message);
    res.json({
      summary: sub.overall_feedback || "Review your submission for improvement areas.",
      strengths: sub.strengths || [],
      improvements: sub.improvements || [],
      study_tips: ["Review the assignment rubric", "Practice similar problems", "Ask the AI companion for hints"],
    });
  }
});

// ── All submissions for the current student (for feedback page) ──

router.get("/submissions", async (req, res) => {
  const studentId = req.user?.id || null;
  const studentName = req.user?.name || "Demo Trainee";

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  const mine = (subs || []).filter((s) =>
    (studentId && s.student_id === studentId) || s.trainee_name === studentName
  );

  res.json(mine);
});

// ═══════════════════════════════════════════════════════════
// UNIT COMPLETION TRACKING
// ═══════════════════════════════════════════════════════════

// Get progress for a class (which units are completed)
router.get("/progress/class/:classId", async (req, res) => {
  const studentId = req.user?.id;
  if (!studentId) return res.json([]);

  const { data, error } = await supabase
    .from("student_progress")
    .select("unit_index, completed, completed_at")
    .eq("student_id", studentId)
    .eq("class_id", req.params.classId);

  if (error && error.message.includes("student_progress")) {
    return res.json([]); // Table doesn't exist yet
  }
  res.json(data || []);
});

// Toggle unit completion
router.post("/progress/toggle", async (req, res) => {
  const studentId = req.user?.id;
  if (!studentId) return res.status(401).json({ error: "Login required" });

  const { course_id, class_id, unit_index } = req.body;
  if (!class_id || unit_index === undefined) return res.status(400).json({ error: "class_id and unit_index required" });

  try {
    // Check if record exists
    const { data: existing } = await supabase
      .from("student_progress")
      .select("id, completed")
      .eq("student_id", studentId)
      .eq("class_id", class_id)
      .eq("unit_index", unit_index)
      .maybeSingle();

    if (existing) {
      // Toggle
      const newVal = !existing.completed;
      await supabase.from("student_progress").update({
        completed: newVal,
        completed_at: newVal ? new Date().toISOString() : null,
      }).eq("id", existing.id);
      return res.json({ completed: newVal });
    }

    // Create new — mark as completed
    const id = `sp-${uuidv4().slice(0, 8)}`;
    const { error } = await supabase.from("student_progress").insert({
      id,
      student_id: studentId,
      course_id: course_id || "",
      class_id,
      unit_index,
      completed: true,
      completed_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ completed: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get overall course progress (all classes)
router.get("/progress/course/:courseId", async (req, res) => {
  const studentId = req.user?.id;
  if (!studentId) return res.json({ classes: [] });

  // Get all classes in the course
  const { data: weeks } = await supabase.from("weeks").select("id").eq("course_id", req.params.courseId);
  if (!weeks || weeks.length === 0) return res.json({ classes: [] });

  const { data: classes } = await supabase.from("classes").select("id, number, title, learning_units").in("week_id", weeks.map((w) => w.id));

  // Get all progress for this student in these classes
  const classIds = (classes || []).map((c) => c.id);
  let progressData = [];
  if (classIds.length > 0) {
    const { data } = await supabase
      .from("student_progress")
      .select("class_id, unit_index, completed")
      .eq("student_id", studentId)
      .in("class_id", classIds);
    progressData = data || [];
  }

  // Calculate per-class progress
  const classProgress = (classes || []).map((cls) => {
    const totalUnits = (cls.learning_units || []).length;
    const completedUnits = progressData.filter((p) => p.class_id === cls.id && p.completed).length;
    return {
      class_id: cls.id,
      number: cls.number,
      title: cls.title,
      total_units: totalUnits,
      completed_units: completedUnits,
      percent: totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0,
    };
  });

  const totalUnits = classProgress.reduce((s, c) => s + c.total_units, 0);
  const totalCompleted = classProgress.reduce((s, c) => s + c.completed_units, 0);

  res.json({
    classes: classProgress,
    total_units: totalUnits,
    completed_units: totalCompleted,
    percent: totalUnits > 0 ? Math.round((totalCompleted / totalUnits) * 100) : 0,
  });
});

module.exports = router;
