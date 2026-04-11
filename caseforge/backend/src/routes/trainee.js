const express = require("express");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../supabase");
const { gradeSubmission, companionChat } = require("../services/grading");
const { runPythonCode } = require("../services/codeRunner");

const router = express.Router();

// ── Course browsing (published only) ──

router.get("/courses", async (req, res) => {
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published");

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
  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", req.params.courseId)
    .eq("status", "published")
    .single();
  if (!course) return res.json({ error: "Not found" });

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
    .single();
  if (!course) return res.json({ error: "Course not found" });

  // Find the class and its week
  const { data: cls } = await supabase
    .from("classes")
    .select("*")
    .eq("id", classId)
    .single();
  if (!cls) return res.json({ error: "Class not found" });

  const { data: week } = await supabase
    .from("weeks")
    .select("*")
    .eq("id", cls.week_id)
    .eq("course_id", courseId)
    .single();
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
      .single();
    if (!course) return res.json({ error: "Course not found" });

    const { data: cls } = await supabase
      .from("classes")
      .select("*")
      .eq("id", classId)
      .single();
    if (!cls) return res.json({ error: "Class not found" });

    const { data: week } = await supabase
      .from("weeks")
      .select("*")
      .eq("id", cls.week_id)
      .single();

    const { data: assignment } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .eq("class_id", classId)
      .single();
    if (!assignment) return res.json({ error: "Assignment not found" });

    const { class_id, ...asnData } = assignment;

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

// ── Code execution ──

router.post("/run", async (req, res) => {
  const code = req.body.code || "";
  const result = await runPythonCode(code, 10);
  res.json(result);
});

// ── Submission / Grading ──

router.post("/submit", async (req, res) => {
  const { course_id, class_id, assignment_id, code, trainee_name } = req.body;

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignment_id || "")
    .eq("class_id", class_id || "")
    .single();

  if (!assignment) return res.json({ error: "Assignment not found" });

  const execResult = await runPythonCode(code || "", 10);
  const result = await gradeSubmission(assignment, code || "", execResult);

  const submission = {
    id: `sub-${uuidv4().slice(0, 6)}`,
    course_id: course_id || "",
    class_id: class_id || "",
    assignment_id: assignment_id || "",
    trainee_name: trainee_name || "Demo Trainee",
    code: code || "",
    execution_output: (execResult.stdout || "") + (execResult.stderr || ""),
    ...result,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("submissions").insert(submission);
  if (error) return res.status(500).json({ error: error.message });

  res.json(submission);
});

// ── Companion Chat ──

router.post("/companion/chat", async (req, res) => {
  const result = await companionChat(
    req.body.messages,
    req.body.assignment,
    req.body.current_code || ""
  );
  res.json(result);
});

// ── Progress ──

router.get("/progress", async (req, res) => {
  const name = "Demo Trainee";

  const { data: allSubs } = await supabase.from("submissions").select("*");
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published");

  const subs = allSubs || [];
  const mine = subs.filter((s) => s.trainee_name === name);
  const ranked = [...subs].sort((a, b) => b.overall_score - a.overall_score);
  const rank =
    ranked.findIndex((s) => s.trainee_name === name) + 1 || ranked.length + 1;

  const avgScore =
    mine.length > 0
      ? Math.round(mine.reduce((sum, s) => sum + s.overall_score, 0) / mine.length)
      : 0;

  res.json({
    courses_enrolled: (courses || []).length,
    completed: mine.length,
    avg_score: avgScore,
    rank,
    total: new Set(subs.map((s) => s.trainee_name)).size,
    submissions: mine,
    leaderboard: ranked.slice(0, 10).map((s, i) => ({
      name: s.trainee_name,
      score: s.overall_score,
      rank: i + 1,
    })),
  });
});

module.exports = router;
