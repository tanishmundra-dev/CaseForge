const express = require("express");
const { v4: uuidv4 } = require("uuid");
const supabase = require("../supabase");
const { chat: chatWithLLM, generate: generateCourse } = require("../services/llm");

const router = express.Router();

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
      // Try with resource_links, fall back without if column doesn't exist
      let classInserted = false;
      const { error: clErr1 } = await supabase.from("classes").insert({
        id: classId, number: cls.number, title: cls.title,
        description: cls.description || "", resource_links: cls.references || [],
        week_id: weekId,
      });
      if (clErr1) {
        // Retry without resource_links column
        const { error: clErr2 } = await supabase.from("classes").insert({
          id: classId, number: cls.number, title: cls.title,
          description: cls.description || "", week_id: weekId,
        });
        if (clErr2) { console.error(`  Class ${cls.number} insert failed:`, clErr2.message); continue; }
        classInserted = true;
      } else {
        classInserted = true;
      }

      if (!classInserted) continue;
      console.log(`    Class ${cls.number}: "${cls.title}" | ${cls.assignments?.length} assignments`);

      for (const asn of cls.assignments || []) {
        const asnId = `a-${uuidv4().slice(0, 6)}`;
        const { error: aErr } = await supabase.from("assignments").insert({
          id: asnId,
          title: asn.title || "Exercise",
          description: asn.description || "",
          difficulty: asn.difficulty || "Intermediate",
          type: asn.type || "coding",
          hints: asn.hints || [],
          pitfalls: asn.pitfalls || [],
          aha_moment: asn.aha_moment || "",
          starter_code: asn.starter_code || "",
          test_cases: asn.test_cases || [],
          rubric: asn.rubric || [],
          questions: asn.questions || [],
          files: asn.files || [],
          class_id: classId,
        });
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

// ── Mission Control: Chat ──

router.post("/mission-control/chat", async (req, res) => {
  try {
    const { messages, currentCourse } = req.body;
    const result = await chatWithLLM(messages, currentCourse || null);
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
    console.error("Generation error:", err.status, err.message, err.error || "");
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
    .order("overall_score", { ascending: false });
  res.json(subs || []);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = router;
