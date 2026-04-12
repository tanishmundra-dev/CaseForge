const express = require("express");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const supabase = require("../supabase");
const { chat: chatWithLLM, generate: generateCourse } = require("../services/llm");
const { extractText, truncateText } = require("../services/fileParser");

const router = express.Router();

// ── Multer config for file uploads ──
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".docx", ".pptx", ".txt", ".md"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(", ")}`));
  },
});

// ── Helper: build nested course object from flat DB rows ──
async function buildCourseObject(course) {
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
    classMap[cls.id] = { ...cls, assignments: [], references: cls.resource_links || [] };
    delete classMap[cls.id].week_id;
    delete classMap[cls.id].resource_links;
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

  return { ...course, weeks: weekList };
}

// ── Helper: save full course to Supabase ──
async function saveCourseToDb(courseData, status) {
  const courseId = `course-${uuidv4().slice(0, 8)}`;
  console.log(`Saving course: "${courseData.title}" with ${courseData.weeks?.length} weeks`);

  const { error: courseErr } = await supabase.from("courses").insert({
    id: courseId,
    title: courseData.title,
    description: courseData.description,
    difficulty: courseData.difficulty || "Intermediate",
    status: status || "draft",
  });
  if (courseErr) { console.error("Course insert failed:", courseErr.message); throw courseErr; }

  for (const week of courseData.weeks || []) {
    const weekId = `w-${uuidv4().slice(0, 6)}`;
    const { error: wErr } = await supabase.from("weeks").insert({
      id: weekId,
      number: week.number,
      title: week.title,
      course_id: courseId,
    });
    if (wErr) { console.error(`Week ${week.number} insert failed:`, wErr.message); continue; }
    console.log(`  Week ${week.number}: "${week.title}" | ${week.classes?.length} classes`);

    for (const cls of week.classes || []) {
      const classId = `c-${uuidv4().slice(0, 6)}`;
      // Try with resource_links + theory_content, fall back gracefully
      let classInserted = false;
      // Merge references + resources into one resource_links array
      const allResources = [...(cls.references || []), ...(cls.resources || [])];
      const { error: clErr1 } = await supabase.from("classes").insert({
        id: classId, number: cls.number, title: cls.title,
        description: cls.description || "", resource_links: allResources,
        theory_content: cls.theory_content || "",
        week_id: weekId,
      });
      if (clErr1) {
        // Retry without resource_links column
        const { error: clErr2 } = await supabase.from("classes").insert({
          id: classId, number: cls.number, title: cls.title,
          description: cls.description || "", theory_content: cls.theory_content || "",
          week_id: weekId,
        });
        if (clErr2) {
          // Retry without theory_content too (column may not exist yet)
          const { error: clErr3 } = await supabase.from("classes").insert({
            id: classId, number: cls.number, title: cls.title,
            description: cls.description || "", week_id: weekId,
          });
          if (clErr3) { console.error(`  Class ${cls.number} insert failed:`, clErr3.message); continue; }
        }
        classInserted = true;
      } else {
        classInserted = true;
      }

      if (!classInserted) continue;
      console.log(`    Class ${cls.number}: "${cls.title}" | ${cls.assignments?.length} assignments`);

      for (const asn of cls.assignments || []) {
        const asnId = `a-${uuidv4().slice(0, 6)}`;
        const asnPayload = {
          id: asnId,
          title: asn.title || "Exercise",
          description: asn.description || "",
          difficulty: asn.difficulty || "Intermediate",
          type: asn.type || "coding",
          hints: asn.hints || [],
          pitfalls: asn.pitfalls || [],
          aha_moment: asn.aha_moment || "",
          starter_code: asn.starter_code || "",
          solution_code: asn.solution_code || "",
          test_cases: asn.test_cases || [],
          rubric: asn.rubric || [],
          questions: asn.questions || [],
          files: asn.files || [],
          class_id: classId,
        };
        let { error: aErr } = await supabase.from("assignments").insert(asnPayload);
        // Fallback if solution_code column doesn't exist yet
        if (aErr && aErr.message.includes("solution_code")) {
          delete asnPayload.solution_code;
          ({ error: aErr } = await supabase.from("assignments").insert(asnPayload));
        }
        if (aErr) console.error(`      Assignment "${asn.title}" insert failed:`, aErr.message);
        else console.log(`      Assignment: "${asn.title}" (${asn.type}) saved`);
      }
    }
  }

  const { data: saved } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  return await buildCourseObject(saved);
}

// ── Course CRUD ──

router.get("/courses", async (req, res) => {
  const { data: courses, error } = await supabase.from("courses").select("*");
  if (error) return res.status(500).json({ error: error.message });

  const result = [];
  for (const c of courses) {
    result.push(await buildCourseObject(c));
  }
  res.json(result);
});

router.get("/courses/:courseId", async (req, res) => {
  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", req.params.courseId)
    .single();
  if (error || !course) return res.json({ error: "Not found" });
  res.json(await buildCourseObject(course));
});

router.post("/courses", async (req, res) => {
  try {
    const saved = await saveCourseToDb(req.body, req.body.status || "draft");
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/courses/:courseId", async (req, res) => {
  const { courseId } = req.params;
  const payload = req.body;

  const { data: existing } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (!existing) return res.json({ error: "Not found" });

  const updates = {};
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.difficulty !== undefined) updates.difficulty = payload.difficulty;
  if (payload.status !== undefined) updates.status = payload.status;

  await supabase.from("courses").update(updates).eq("id", courseId);

  const { data: updated } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  res.json(await buildCourseObject(updated));
});

router.post("/courses/:courseId/publish", async (req, res) => {
  const { courseId } = req.params;

  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (!course) return res.json({ error: "Not found" });

  await supabase.from("courses").update({ status: "published" }).eq("id", courseId);

  const { data: updated } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  res.json(await buildCourseObject(updated));
});

// ── Assignment CRUD ──

router.get("/classes/:classId", async (req, res) => {
  const { data: cls } = await supabase.from("classes").select("*").eq("id", req.params.classId).maybeSingle();
  if (!cls) return res.status(404).json({ error: "Class not found" });

  const { data: week } = await supabase.from("weeks").select("*").eq("id", cls.week_id).maybeSingle();
  const { data: course } = week ? await supabase.from("courses").select("*").eq("id", week.course_id).maybeSingle() : { data: null };
  const { data: assignments } = await supabase.from("assignments").select("*").eq("class_id", cls.id);

  res.json({
    ...cls,
    week_number: week?.number,
    week_title: week?.title,
    course_id: course?.id,
    course_title: course?.title,
    assignments: assignments || [],
  });
});

router.post("/classes/:classId/assignments", async (req, res) => {
  const asnId = `a-${require("uuid").v4().slice(0, 6)}`;
  const payload = {
    id: asnId,
    title: req.body.title || "New Assignment",
    description: req.body.description || "",
    difficulty: req.body.difficulty || "Intermediate",
    type: req.body.type || "coding",
    hints: req.body.hints || [],
    pitfalls: req.body.pitfalls || [],
    aha_moment: req.body.aha_moment || "",
    starter_code: req.body.starter_code || "",
    solution_code: req.body.solution_code || "",
    test_cases: req.body.test_cases || [],
    rubric: req.body.rubric || [],
    questions: req.body.questions || [],
    files: req.body.files || [],
    class_id: req.params.classId,
  };
  let { error } = await supabase.from("assignments").insert(payload);
  if (error && error.message.includes("solution_code")) {
    delete payload.solution_code;
    ({ error } = await supabase.from("assignments").insert(payload));
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json(payload);
});

router.put("/assignments/:assignmentId", async (req, res) => {
  const { assignmentId } = req.params;
  const fields = {};
  const allowed = ["title", "description", "difficulty", "type", "hints", "pitfalls", "aha_moment", "starter_code", "solution_code", "test_cases", "rubric", "questions", "files"];
  for (const k of allowed) {
    if (req.body[k] !== undefined) fields[k] = req.body[k];
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: "No fields to update" });

  const { error } = await supabase.from("assignments").update(fields).eq("id", assignmentId);
  if (error) return res.status(500).json({ error: error.message });

  const { data: updated } = await supabase.from("assignments").select("*").eq("id", assignmentId).maybeSingle();
  res.json(updated);
});

router.delete("/assignments/:assignmentId", async (req, res) => {
  const { error } = await supabase.from("assignments").delete().eq("id", req.params.assignmentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── Class update ──

router.put("/classes/:classId", async (req, res) => {
  const fields = {};
  if (req.body.title !== undefined) fields.title = req.body.title;
  if (req.body.description !== undefined) fields.description = req.body.description;
  if (req.body.theory_content !== undefined) fields.theory_content = req.body.theory_content;

  const { error } = await supabase.from("classes").update(fields).eq("id", req.params.classId);
  if (error) return res.status(500).json({ error: error.message });

  const { data: updated } = await supabase.from("classes").select("*").eq("id", req.params.classId).maybeSingle();
  res.json(updated);
});

// ── Mission Control: File Upload & Text Extraction ──

router.post("/mission-control/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const text = await extractText(req.file.path, req.file.originalname);
    const truncated = truncateText(text);

    // Clean up the temp file
    fs.unlink(req.file.path, () => {});

    res.json({
      filename: req.file.originalname,
      size: req.file.size,
      extractedLength: text.length,
      truncatedLength: truncated.length,
      content: truncated,
    });
  } catch (err) {
    // Clean up on error
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error("Upload error:", err);
    res.status(400).json({ error: err.message || "Failed to process file" });
  }
});

// ── Mission Control: Chat ──

router.post("/mission-control/chat", async (req, res) => {
  try {
    const { messages, currentCourse, fileContent } = req.body;
    const result = await chatWithLLM(messages, currentCourse || null, fileContent || null);
    res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ action: "chat", message: "Something went wrong. Please try again." });
  }
});

// ── Mission Control: Generate Course via SSE ──

router.post("/mission-control/generate-stream", async (req, res) => {
  const { context } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();
  };

  try {
    send("status", { message: "Designing course structure..." });

    // Two-pass generation with real-time progress
    const course = await generateCourse(context, (type, data) => {
      if (type === "outline") {
        // Pass 1 done — send course meta + week titles
        send("course_meta", { title: data.title, description: data.description, difficulty: data.difficulty });
        for (const w of data.weeks || []) {
          send("week", { number: w.number, title: w.title });
          for (const c of w.classes || []) {
            send("class", { week: w.number, number: c.number, title: c.title, description: "" });
          }
        }
      } else if (type === "week") {
        // Pass 2 — each week filled with content
        send("week_content", { number: data.number, title: data.title, classes: data.classes });
      }
    });

    send("done", { course });
  } catch (err) {
    console.error("Generation error:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    send("error", { message: "Failed to generate course. Please try again." });
  }

  res.end();
});

// ── Mission Control: Save Generated Course ──

router.post("/mission-control/save", async (req, res) => {
  try {
    const { course, status } = req.body;
    const saved = await saveCourseToDb(course, status || "draft");
    res.json(saved);
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ──

router.get("/analytics/summary", async (req, res) => {
  const { data: subs } = await supabase.from("submissions").select("*");
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .eq("status", "published");

  const total = (subs || []).length;
  const avg =
    total > 0 ? subs.reduce((sum, s) => sum + s.overall_score, 0) / total : 0;
  const uniqueNames = new Set((subs || []).map((s) => s.trainee_name));
  const withScore = (subs || []).filter((s) => s.overall_score > 0).length;

  res.json({
    total_trainees: uniqueNames.size,
    total_submissions: total,
    avg_score: Math.round(avg * 10) / 10,
    completion_rate: total > 0 ? Math.round((withScore / total) * 100) : 0,
    courses_published: (courses || []).length,
  });
});

router.get("/analytics/submissions", async (req, res) => {
  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false });
  res.json(subs || []);
});

// ── Student Rankings (aggregated per student) ──
router.get("/analytics/rankings", async (req, res) => {
  const { data: subs } = await supabase.from("submissions").select("*");
  const { data: students } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("role", "student");

  // Build lookup maps: by id and by name
  const studentById = {};
  const studentByName = {};
  for (const st of students || []) {
    studentById[st.id] = st;
    studentByName[st.name.toLowerCase()] = st;
  }

  // Aggregate scores per student
  const scores = {};
  for (const s of subs || []) {
    const key = s.student_id || s.trainee_name;
    if (!scores[key]) scores[key] = { id: s.student_id, name: s.trainee_name, email: "", total: 0, count: 0, best: 0 };
    scores[key].total += s.overall_score;
    scores[key].count++;
    if (s.overall_score > scores[key].best) scores[key].best = s.overall_score;

    // Resolve student info: first by student_id, then by trainee_name
    if (s.student_id && studentById[s.student_id]) {
      scores[key].id = studentById[s.student_id].id;
      scores[key].name = studentById[s.student_id].name;
      scores[key].email = studentById[s.student_id].email;
    } else if (s.trainee_name && studentByName[s.trainee_name.toLowerCase()]) {
      const matched = studentByName[s.trainee_name.toLowerCase()];
      scores[key].id = matched.id;
      scores[key].name = matched.name;
      scores[key].email = matched.email;
    }
  }

  const ranked = Object.values(scores)
    .map((v) => ({ ...v, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg)
    .map((v, i) => ({ ...v, rank: i + 1 }));

  res.json(ranked);
});

router.get("/analytics/score-distribution", async (req, res) => {
  const { data: subs } = await supabase.from("submissions").select("*");
  const buckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };

  for (const s of subs || []) {
    const sc = s.overall_score;
    if (sc <= 20) buckets["0-20"]++;
    else if (sc <= 40) buckets["21-40"]++;
    else if (sc <= 60) buckets["41-60"]++;
    else if (sc <= 80) buckets["61-80"]++;
    else buckets["81-100"]++;
  }

  res.json(Object.entries(buckets).map(([range, count]) => ({ range, count })));
});

// ── Students ──

router.get("/students", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, created_at")
    .eq("role", "student")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── Student enrollment ──

router.post("/students/:studentId/enroll", async (req, res) => {
  const { studentId } = req.params;
  const { course_id } = req.body;
  if (!course_id) return res.status(400).json({ error: "course_id required" });

  // Check if already enrolled
  const { data: existing } = await supabase
    .from("enrollments")
    .select("course_id")
    .eq("student_id", studentId)
    .eq("course_id", course_id)
    .maybeSingle();
  if (existing) return res.json({ success: true, message: "Already enrolled" });

  const { error } = await supabase.from("enrollments").insert({
    student_id: studentId,
    course_id,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.get("/students/:studentId/enrollments", async (req, res) => {
  const { data, error } = await supabase
    .from("enrollments")
    .select("course_id, enrolled_at")
    .eq("student_id", req.params.studentId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// ── Attendance / Activity ──

router.get("/analytics/attendance", async (req, res) => {
  const { data: subs } = await supabase.from("submissions").select("trainee_name, submitted_at").order("submitted_at");
  // Group by day
  const byDay = {};
  for (const s of subs || []) {
    const day = new Date(s.submitted_at).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  }
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({ date: key, label: d.toLocaleDateString("en", { weekday: "short" }), submissions: byDay[key] || 0 });
  }
  res.json(last7);
});

// ── Student detail (progress per course) ──

router.get("/students/:studentId/detail", async (req, res) => {
  const { studentId } = req.params;

  // Get student info
  const { data: student } = await supabase
    .from("users")
    .select("id, name, email, role, created_at")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: "Student not found" });

  // Get enrollments with course info
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, enrolled_at")
    .eq("student_id", studentId);

  const courseIds = (enrollments || []).map((e) => e.course_id);
  let courses = [];
  if (courseIds.length > 0) {
    const { data } = await supabase.from("courses").select("id, title, difficulty, status").in("id", courseIds);
    courses = data || [];
  }

  // Get all submissions by this student (match by student_id OR trainee_name)
  const { data: allSubs } = await supabase.from("submissions").select("*");
  const studentSubs = (allSubs || []).filter(
    (s) => s.student_id === studentId || s.trainee_name === student.name
  );

  // Build per-course progress
  const courseProgress = courses.map((c) => {
    const courseSubs = studentSubs.filter((s) => s.course_id === c.id);
    const avg = courseSubs.length > 0
      ? Math.round(courseSubs.reduce((sum, s) => sum + s.overall_score, 0) / courseSubs.length)
      : 0;
    return {
      course_id: c.id,
      title: c.title,
      difficulty: c.difficulty,
      status: c.status,
      enrolled_at: (enrollments || []).find((e) => e.course_id === c.id)?.enrolled_at,
      submissions: courseSubs.length,
      avg_score: avg,
      best_score: courseSubs.length > 0 ? Math.max(...courseSubs.map((s) => s.overall_score)) : 0,
      latest_submission: courseSubs.length > 0
        ? courseSubs.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0].submitted_at
        : null,
    };
  });

  // Overall stats
  const totalSubs = studentSubs.length;
  const overallAvg = totalSubs > 0
    ? Math.round(studentSubs.reduce((sum, s) => sum + s.overall_score, 0) / totalSubs)
    : 0;

  // Rank among all students
  const studentScores = {};
  for (const s of allSubs || []) {
    const key = s.student_id || s.trainee_name;
    if (!studentScores[key]) studentScores[key] = { total: 0, count: 0 };
    studentScores[key].total += s.overall_score;
    studentScores[key].count++;
  }
  const ranked = Object.entries(studentScores)
    .map(([key, v]) => ({ key, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg);
  const rank = ranked.findIndex((r) => r.key === studentId || r.key === student.name) + 1 || ranked.length + 1;

  res.json({
    student,
    courses_enrolled: courses.length,
    total_submissions: totalSubs,
    overall_avg: overallAvg,
    rank,
    total_students: ranked.length,
    course_progress: courseProgress,
    recent_submissions: studentSubs
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 20),
  });
});

module.exports = router;
