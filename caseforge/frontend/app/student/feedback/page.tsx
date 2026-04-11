"use client";
import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { MessageSquare, ChevronDown, ChevronRight, Sparkles, Loader2, Trophy, Target, Lightbulb, TrendingUp } from "lucide-react";

interface Submission {
  id: string;
  course_id: string;
  assignment_id: string;
  overall_score: number;
  grade: string;
  overall_feedback: string;
  strengths: string[];
  improvements: string[];
  submitted_at: string;
  code?: string;
}

interface AIFeedback {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  study_tips: string[];
  next_steps: string;
  score_breakdown: string;
}

export default function FeedbackPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<Record<string, AIFeedback>>({});
  const [feedbackLoading, setFeedbackLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchAPI("/trainee/submissions")
      .then(setSubmissions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestFeedback = async (subId: string) => {
    if (aiFeedback[subId]) return; // Already loaded
    setFeedbackLoading(subId);
    try {
      const fb = await fetchAPI("/trainee/feedback", {
        method: "POST",
        body: JSON.stringify({ submission_id: subId }),
      });
      setAiFeedback((p) => ({ ...p, [subId]: fb }));
    } catch {
      setAiFeedback((p) => ({
        ...p,
        [subId]: {
          summary: "Unable to generate AI feedback at this time.",
          strengths: [], weaknesses: [], study_tips: [],
          next_steps: "Try again later.", score_breakdown: "",
        },
      }));
    } finally {
      setFeedbackLoading(null);
    }
  };

  const toggleExpand = (subId: string) => {
    if (expanded === subId) {
      setExpanded(null);
    } else {
      setExpanded(subId);
      requestFeedback(subId);
    }
  };

  const scoreColor = (s: number) => s >= 80 ? "var(--success)" : s >= 60 ? "var(--warning)" : "var(--danger)";

  if (loading) return <div style={{ padding: 60 }}><p className="animate-pulse-slow" style={{ color: "var(--text-tertiary)" }}>Loading submissions...</p></div>;

  return (
    <div style={{ padding: "60px 48px", maxWidth: 900, margin: "0 auto" }}>
      <div className="animate-in animate-in-1" style={{ marginBottom: 40 }}>
        <span className="overline" style={{ display: "block", marginBottom: 12 }}>AI FEEDBACK</span>
        <h1 className="display-heading" style={{ fontSize: 36 }}>Performance Analysis</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15, marginTop: 8 }}>Click any submission to get personalized AI-powered feedback</p>
      </div>

      {submissions.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80 }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>No submissions yet.</p>
          <p style={{ color: "var(--text-tertiary)", marginTop: 8 }}>Complete some assignments to see your feedback here.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {submissions.map((sub, i) => {
            const isOpen = expanded === sub.id;
            const fb = aiFeedback[sub.id];
            const isLoadingFb = feedbackLoading === sub.id;

            return (
              <div key={sub.id} className={`card animate-in animate-in-${Math.min(i + 2, 6)}`} style={{ padding: 0, overflow: "hidden" }}>
                {/* Header */}
                <div
                  onClick={() => toggleExpand(sub.id)}
                  style={{ display: "flex", alignItems: "center", padding: "16px 20px", cursor: "pointer", gap: 14 }}
                >
                  {isOpen ? <ChevronDown size={16} color="var(--accent)" /> : <ChevronRight size={16} color="var(--text-tertiary)" />}
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-heading)" }}>{sub.assignment_id}</span>
                    <span style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 10 }}>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                  </div>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: scoreColor(sub.overall_score) }}>{sub.overall_score}%</span>
                  <span className={`badge ${sub.overall_score >= 80 ? "badge-success" : sub.overall_score >= 60 ? "badge-warning" : "badge-danger"}`} style={{ fontSize: 10 }}>{sub.grade}</span>
                </div>

                {/* Expanded AI Feedback */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "20px 24px", background: "var(--bg-secondary)" }}>
                    {isLoadingFb ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", justifyContent: "center" }}>
                        <Loader2 size={18} className="animate-pulse-slow" color="var(--accent)" />
                        <span style={{ fontSize: 14, color: "var(--text-tertiary)" }}>Generating AI feedback...</span>
                      </div>
                    ) : fb ? (
                      <div>
                        {/* Summary */}
                        <div style={{ display: "flex", gap: 10, marginBottom: 20, padding: "14px 16px", background: "var(--accent-subtle)", borderRadius: 8, border: "1px solid rgba(217,119,6,0.15)" }}>
                          <Sparkles size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                          <p style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>{fb.summary}</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                          {/* Strengths */}
                          <div style={{ padding: "12px 14px", background: "var(--success-bg)", borderRadius: 8, border: "1px solid rgba(22,163,74,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <Trophy size={14} color="var(--success)" />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--success)", textTransform: "uppercase" }}>Strengths</span>
                            </div>
                            {(fb.strengths || []).map((s, si) => (
                              <p key={si} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.5 }}>{s}</p>
                            ))}
                          </div>

                          {/* Weaknesses */}
                          <div style={{ padding: "12px 14px", background: "var(--danger-bg)", borderRadius: 8, border: "1px solid rgba(220,38,38,0.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                              <Target size={14} color="var(--danger)" />
                              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase" }}>Areas to Improve</span>
                            </div>
                            {(fb.weaknesses || []).map((w, wi) => (
                              <p key={wi} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, lineHeight: 1.5 }}>{w}</p>
                            ))}
                          </div>
                        </div>

                        {/* Study Tips */}
                        <div style={{ padding: "12px 14px", background: "var(--bg-tertiary)", borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <Lightbulb size={14} color="var(--accent)" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>Study Tips</span>
                          </div>
                          {(fb.study_tips || []).map((tip, ti) => (
                            <p key={ti} style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4, paddingLeft: 8, borderLeft: "2px solid var(--accent)", lineHeight: 1.5 }}>{tip}</p>
                          ))}
                        </div>

                        {/* Next Steps */}
                        {fb.next_steps && (
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <TrendingUp size={14} color="var(--text-tertiary)" style={{ marginTop: 2 }} />
                            <p style={{ fontSize: 13, color: "var(--text-tertiary)", lineHeight: 1.5, fontStyle: "italic" }}>{fb.next_steps}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>{sub.overall_feedback}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
