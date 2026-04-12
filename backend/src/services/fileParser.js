const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const AdmZip = require("adm-zip");

/**
 * Extract text content from uploaded files (PDF, DOCX, PPTX, DOC, TXT)
 * Returns a string of extracted text, truncated to maxChars to avoid LLM token limits.
 */
async function extractText(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return extractPDF(filePath);
    case ".docx":
      return extractDOCX(filePath);
    case ".pptx":
      return extractPPTX(filePath);
    case ".txt":
    case ".md":
      return fs.readFileSync(filePath, "utf-8");
    default:
      throw new Error(`Unsupported file type: ${ext}. Supported: .pdf, .docx, .pptx, .txt, .md`);
  }
}

async function extractPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text || "";
}

async function extractDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || "";
}

function extractPPTX(filePath) {
  // PPTX is a ZIP archive containing XML slides
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  const slideTexts = [];

  // Sort slide entries by name to maintain order
  const slideEntries = entries
    .filter((e) => e.entryName.match(/^ppt\/slides\/slide\d+\.xml$/))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.match(/slide(\d+)/)?.[1] || "0");
      const numB = parseInt(b.entryName.match(/slide(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  for (const entry of slideEntries) {
    const xml = entry.getData().toString("utf-8");
    // Extract text from <a:t> tags (PowerPoint text elements)
    const textMatches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches.map((t) => t.replace(/<\/?a:t>/g, "").trim()).filter(Boolean);
    if (texts.length > 0) {
      const slideNum = entry.entryName.match(/slide(\d+)/)?.[1] || "?";
      slideTexts.push(`--- Slide ${slideNum} ---\n${texts.join("\n")}`);
    }
  }

  return slideTexts.join("\n\n");
}

/**
 * Truncate extracted text to fit within LLM context limits
 */
function truncateText(text, maxChars = 15000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... content truncated due to length ...]";
}

module.exports = { extractText, truncateText };
