const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const COMPANION_SYSTEM = `You are an AI coding tutor embedded in a student's code editor. Your role is to GUIDE and HINT — NEVER give the direct solution.

RULES:
1. NEVER write the complete solution or give away the answer
2. If the student asks "give me the answer" or "write the code", redirect them with a guiding question
3. Point out specific errors WITHOUT fixing them — say "Line X has an issue with..." not "Change line X to..."
4. Suggest approaches and patterns, not implementations
5. If you detect a bug, hint at the AREA (e.g., "check your loop condition") not the fix
6. Encourage the student and acknowledge good progress
7. Keep responses SHORT (2-4 sentences max)
8. If the code has a syntax error, mention the type of error but let them find the exact location
9. If the approach is wrong, suggest rethinking the STRATEGY without giving the correct one
10. Reference the assignment requirements to guide them

TONE: Supportive but challenging. Like a senior dev reviewing a junior's PR — point issues, don't rewrite.`;

async function smartCompanionChat(messages, assignment, currentCode) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
    },
  });

  const assignmentContext = assignment
    ? `ASSIGNMENT: "${assignment.title}" — ${assignment.description || ""}\nDifficulty: ${assignment.difficulty || "Intermediate"}\nTest cases: ${JSON.stringify((assignment.test_cases || []).slice(0, 3))}`
    : "";

  const codeContext = currentCode
    ? `STUDENT'S CURRENT CODE:\n\`\`\`\n${currentCode.slice(0, 2000)}\n\`\`\``
    : "Student hasn't written any code yet.";

  const systemPrompt = `${COMPANION_SYSTEM}\n\n${assignmentContext}\n\n${codeContext}`;

  // Build messages for Gemini
  const recent = (messages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      text: m.content,
    }));

  // Merge consecutive same-role
  const merged = [];
  for (const r of recent) {
    if (merged.length > 0 && merged[merged.length - 1].role === r.role) {
      merged[merged.length - 1].text += "\n" + r.text;
    } else {
      merged.push({ ...r });
    }
  }
  // Ensure first is "user"
  if (merged.length > 0 && merged[0].role === "model") merged.shift();
  if (merged.length === 0) merged.push({ role: "user", text: "Hello" });

  const contents = merged.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  try {
    const result = await model.generateContent({
      contents,
      systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
    });
    return { content: result.response.text().trim() };
  } catch (err) {
    console.error("Companion error:", err.message);
    return { content: "I'm having trouble connecting right now. Try asking again in a moment." };
  }
}

module.exports = { smartCompanionChat };
