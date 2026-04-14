"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { UserPlus, Mail, BookOpen, Plus, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invPassword, setInvPassword] = useState("");
  const [invCourse, setInvCourse] = useState("");
  const [inviting, setInviting] = useState(false);
  const [invMsg, setInvMsg] = useState("");
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [enrollCourse, setEnrollCourse] = useState("");

  const loadData = () => {
    Promise.all([
      fetchAPI("/instructor/students"),
      fetchAPI("/instructor/courses"),
    ]).then(([s, c]) => { setStudents(s); setCourses(c); }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true); setInvMsg("");
    try {
      const data = await fetchAPI("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name: invName, email: invEmail, password: invPassword }),
      });
      if (data.error) { setInvMsg(data.error); setInviting(false); return; }

      // Enroll in course if selected
      if (invCourse && data.user?.id) {
        await fetchAPI(`/instructor/students/${data.user.id}/enroll`, {
          method: "POST",
          body: JSON.stringify({ course_id: invCourse }),
        });
      }

      setInvMsg(`Student "${invName}" created and ${invCourse ? "enrolled!" : "ready!"}`);
      setInvName(""); setInvEmail(""); setInvPassword(""); setInvCourse("");
      loadData();
    } catch { setInvMsg("Network error"); }
    finally { setInviting(false); }
  };

  const handleEnroll = async (studentId: string) => {
    if (!enrollCourse) return;
    try {
      await fetchAPI(`/instructor/students/${studentId}/enroll`, {
        method: "POST",
        body: JSON.stringify({ course_id: enrollCourse }),
      });
      setEnrolling(null); setEnrollCourse("");
    } catch {}
  };

  const publishedCourses = courses.filter((c: any) => c.status === "published");

  return (
    <div style={{ padding: "48px 48px 80px", maxWidth: 1200, margin: "0 auto" }}>
      <div className="animate-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <span className="overline" style={{ display: "block", marginBottom: 12 }}>STUDENT MANAGEMENT</span>
          <h1 className="display-heading" style={{ fontSize: 36 }}>Students</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 8 }}>{students.length} students registered</p>
        </div>
        <button className="btn-primary" onClick={() => setShowInvite(!showInvite)} style={{ fontSize: 13 }}>
          <UserPlus size={16} /> Invite Student
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="card animate-in" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Create Student Account</h3>
          <form onSubmit={handleInvite} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Name</label>
              <input className="input" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Full name" required />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Email</label>
              <input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="student@email.com" required />
            </div>
            <div style={{ flex: "1 1 130px" }}>
              <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Password</label>
              <input className="input" type="text" value={invPassword} onChange={(e) => setInvPassword(e.target.value)} placeholder="min 6 chars" required minLength={6} />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label style={{ fontSize: 12, color: "var(--text-tertiary)", display: "block", marginBottom: 4 }}>Enroll in Course</label>
              <select className="input" value={invCourse} onChange={(e) => setInvCourse(e.target.value)} style={{ cursor: "pointer" }}>
                <option value="">None (invite only)</option>
                {publishedCourses.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <button className="btn-primary" type="submit" disabled={inviting} style={{ padding: "10px 20px" }}>
              <Mail size={14} /> {inviting ? "Creating..." : "Create & Invite"}
            </button>
          </form>
          {invMsg && <p style={{ marginTop: 12, fontSize: 13, color: invMsg.includes("created") ? "var(--success)" : "var(--danger)" }}>{invMsg}</p>}
        </div>
      )}

      {/* Student list */}
      {loading ? (
        <p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading...</p>
      ) : students.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-secondary)" }}>No students yet.</div>
      ) : (
        <div className="card animate-in" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Name</th>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Email</th>
                <th style={{ padding: "12px 20px", textAlign: "left", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Joined</th>
                <th style={{ padding: "12px 20px", textAlign: "right", color: "var(--text-tertiary)", fontSize: 11, textTransform: "uppercase" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 20px", fontWeight: 500 }}>
                    <Link href={`/instructor/students/${s.id}`} style={{ color: "var(--text-heading)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
                      {s.name} <ArrowRight size={12} color="var(--accent)" style={{ opacity: 0.4 }} />
                    </Link>
                  </td>
                  <td style={{ padding: "12px 20px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{s.email}</td>
                  <td style={{ padding: "12px 20px", color: "var(--text-tertiary)", fontSize: 13 }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "12px 20px", textAlign: "right" }}>
                    {enrolling === s.id ? (
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <select className="input" value={enrollCourse} onChange={(e) => setEnrollCourse(e.target.value)} style={{ width: 180, fontSize: 12, padding: "6px 10px" }}>
                          <option value="">Select course</option>
                          {publishedCourses.map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <button className="btn-primary" onClick={() => handleEnroll(s.id)} disabled={!enrollCourse} style={{ padding: "6px 12px", fontSize: 12 }}>Enroll</button>
                        <button className="btn-secondary" onClick={() => setEnrolling(null)} style={{ padding: "6px 12px", fontSize: 12 }}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn-secondary" onClick={() => setEnrolling(s.id)} style={{ padding: "6px 12px", fontSize: 12 }}>
                        <Plus size={12} /> Enroll
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
