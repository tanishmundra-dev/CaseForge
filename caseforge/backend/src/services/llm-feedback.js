const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function callLLMRaw(submission, assignment, studentName) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2000,
      temperature: 0.7,
    },
  });

  const assignmentTitle = assignment?.title || "Unknown Assignment";
  const assignmentDesc = assignment?.description || "";
  const assignmentType = assignment?.type || "coding";

  const prompt = `Analyze this student's submission and provide personalized learning feedback as JSON.

Student: ${studentName}
Assignment: "${assignmentTitle}" (${assignmentType})
Description: ${assignmentDesc}
Score: ${submission.overall_score}/100 (Grade: ${submission.grade})
${submission.code ? `Submitted code:\n${submission.code.slice(0, 1500)}` : ""}
${submission.execution_output ? `Execution output: ${submission.execution_output.slice(0, 500)}` : ""}
${submission.overall_feedback ? `Grading feedback: ${submission.overall_feedback}` : ""}

Return JSON:
{
  "summary": "2-3 sentence personalized analysis of the student's performance — mention specific things they did well and what needs work",
  "strengths": ["specific strength 1", "specific strength 2"],
  "weaknesses": ["specific area to improve 1", "specific area to improve 2"],
  "study_tips": ["actionable study tip 1", "actionable study tip 2", "actionable study tip 3"],
  "next_steps": "1-2 sentences suggesting what the student should focus on next",
  "score_breakdown": "Brief explanation of how the score was earned — what contributed and what detracted"
}

Rules:
- Be encouraging but honest
- Reference specific parts of their code/answers
- Give ACTIONABLE tips, not generic advice
- Match feedback to the assignment type (coding vs quiz vs project)`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = result.response.text().trim();
  try {
    return JSON.parse(text);
  } catch {
    const clean = text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    try { return JSON.parse(clean); } catch {}
    return {
      summary: "Review your submission and focus on the areas marked for improvement.",
      strengths: [],
      weaknesses: [],
      study_tips: ["Practice more problems of this type", "Review the hints provided"],
      next_steps: "Try re-attempting this assignment with the feedback in mind.",
      score_breakdown: `You scored ${submission.overall_score}/100.`,
    };
  }
}

module.exports = { callLLMRaw };
