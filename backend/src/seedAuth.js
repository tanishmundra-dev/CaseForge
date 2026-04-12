const bcrypt = require("bcryptjs");
const supabase = require("./supabase");

async function seedAuth() {
  console.log("Seeding users and enrollments...");

  // Clear existing
  await supabase.from("enrollments").delete().neq("id", "");
  await supabase.from("users").delete().neq("id", "");

  const hash = (pw) => bcrypt.hashSync(pw, 10);

  // ── Instructor (admin) ──
  const { error: adminErr } = await supabase.from("users").insert({
    id: "instructor-001",
    name: "Admin Instructor",
    email: "admin@caseforge.com",
    password_hash: hash("caseforge123"),
    role: "instructor",
  });
  if (adminErr) { console.error("Admin insert error:", adminErr.message); return; }

  // ── Default student ──
  const students = [
    { id: "student-001", name: "Arjun Mehta", email: "student@caseforge.com", password_hash: hash("student123") },
    { id: "student-002", name: "Priya Sharma", email: "priya@caseforge.com", password_hash: hash("student123") },
    { id: "student-003", name: "Rahul Kumar", email: "rahul@caseforge.com", password_hash: hash("student123") },
    { id: "student-004", name: "Sneha Patel", email: "sneha@caseforge.com", password_hash: hash("student123") },
    { id: "student-005", name: "Vikram Singh", email: "vikram@caseforge.com", password_hash: hash("student123") },
    { id: "student-006", name: "Ananya Reddy", email: "ananya@caseforge.com", password_hash: hash("student123") },
    { id: "student-007", name: "Karthik Nair", email: "karthik@caseforge.com", password_hash: hash("student123") },
    { id: "student-008", name: "Divya Joshi", email: "divya@caseforge.com", password_hash: hash("student123") },
  ];

  const { error: studErr } = await supabase
    .from("users")
    .insert(students.map((s) => ({ ...s, role: "student" })));
  if (studErr) { console.error("Student insert error:", studErr.message); return; }

  // ── Enroll all students in the seeded "dockyard" course ──
  const { data: courses } = await supabase.from("courses").select("id").eq("status", "published");
  const courseIds = (courses || []).map((c) => c.id);

  if (courseIds.length > 0) {
    const enrollments = [];
    for (const student of students) {
      for (const courseId of courseIds) {
        enrollments.push({
          student_id: student.id,
          course_id: courseId,
        });
      }
    }
    const { error: enrErr } = await supabase.from("enrollments").insert(enrollments);
    if (enrErr) console.error("Enrollment insert error:", enrErr.message);
    else console.log(`Enrolled ${students.length} students in ${courseIds.length} course(s)`);
  }

  console.log("Auth seed complete! Users:");
  console.log("  Instructor: admin@caseforge.com / caseforge123");
  console.log("  Student:    student@caseforge.com / student123");
}

seedAuth();
