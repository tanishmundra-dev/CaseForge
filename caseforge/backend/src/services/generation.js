function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateCaseStudy(prompt) {
  await sleep(1500);

  return {
    title: "Build a LangChain RAG Pipeline",
    description:
      "Build a production-ready RAG pipeline that answers customer queries using a knowledge base. Covers document chunking, vector search, and retrieval-augmented generation.",
    difficulty: "Intermediate",
    status: "draft",
    weeks: [
      {
        id: "gen-w1",
        number: 1,
        title: "Foundations",
        classes: [
          {
            id: "gen-c1",
            number: 1,
            title: "Document Ingestion & Chunking",
            description:
              "Load documents and split them into semantic chunks for embedding.",
            assignments: [
              {
                id: "gen-a1",
                title: "Smart Document Chunker",
                description:
                  "Build a document chunking system that preserves semantic meaning. Use RecursiveCharacterTextSplitter with configurable chunk size and overlap.",
                difficulty: "Intermediate",
                hints: [
                  "Start with PyPDFLoader for PDF ingestion",
                  "Print chunk count to verify splitting works",
                ],
                pitfalls: [
                  "Fixed character splits break mid-sentence, losing semantic meaning",
                ],
                aha_moment:
                  "Chunk overlap prevents losing context at boundaries — a query about 'refund policy' might span two chunks",
                starter_code:
                  "from typing import List\n\ndef chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:\n    \"\"\"Split text into overlapping chunks.\"\"\"\n    # TODO: Implement chunking with overlap\n    pass\n\nif __name__ == '__main__':\n    sample = 'This is a test document. ' * 100\n    chunks = chunk_text(sample)\n    print(f'Chunks: {len(chunks)}')\n    for i, chunk in enumerate(chunks[:3]):\n        print(f'Chunk {i}: {chunk[:80]}...')",
                test_cases: [
                  {
                    input: "",
                    expected_output: "Chunks:",
                    description: "Should output chunk count",
                  },
                ],
                rubric: [
                  {
                    criterion: "Chunking Logic",
                    excellent: "Proper overlap, handles edge cases",
                    acceptable: "Basic chunking works",
                    poor: "No chunking",
                    weight: 50,
                  },
                  {
                    criterion: "Code Quality",
                    excellent: "Clean, typed, documented",
                    acceptable: "Works but messy",
                    poor: "Incomplete",
                    weight: 50,
                  },
                ],
              },
            ],
          },
          {
            id: "gen-c2",
            number: 2,
            title: "Vector Store & Retrieval",
            description:
              "Embed chunks and build a similarity search system.",
            assignments: [
              {
                id: "gen-a2",
                title: "Build a Vector Search Engine",
                description:
                  "Create a simple vector store that embeds text chunks and retrieves the most similar ones for a given query.",
                difficulty: "Intermediate",
                hints: ["Use cosine similarity for matching"],
                pitfalls: ["Not normalizing vectors before comparison"],
                aha_moment:
                  "Cosine similarity captures semantic meaning, not just keyword overlap",
                starter_code:
                  "import math\n\ndef cosine_similarity(a: list, b: list) -> float:\n    \"\"\"Compute cosine similarity between two vectors.\"\"\"\n    # TODO: Implement\n    pass\n\nif __name__ == '__main__':\n    v1 = [1, 2, 3]\n    v2 = [1, 2, 3]\n    print(f'Similarity: {cosine_similarity(v1, v2)}')",
                test_cases: [
                  {
                    input: "",
                    expected_output: "Similarity:",
                    description: "Should output similarity score",
                  },
                ],
                rubric: [
                  {
                    criterion: "Similarity Logic",
                    excellent: "Correct cosine similarity",
                    acceptable: "Mostly correct",
                    poor: "Wrong or missing",
                    weight: 60,
                  },
                  {
                    criterion: "Code Quality",
                    excellent: "Clean, handles edge cases",
                    acceptable: "Works",
                    poor: "Incomplete",
                    weight: 40,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

async function chatWithMissionControl(messages, ctx) {
  await sleep(500);

  const lastMsg =
    messages.length > 0 ? messages[messages.length - 1].content.toLowerCase() : "";

  if (lastMsg.includes("rubric") || lastMsg.includes("weight")) {
    return {
      content:
        "Good thinking. I'd suggest adjusting the rubric weights to emphasize the core skill being assessed. Want me to make specific suggestions?",
    };
  } else if (lastMsg.includes("hint") || lastMsg.includes("easier")) {
    return {
      content:
        "I can add more scaffolding to the starter code — perhaps pre-written helper functions so students can focus on the core logic. Should I also add more test cases?",
    };
  } else if (lastMsg.includes("harder") || lastMsg.includes("advanced")) {
    return {
      content:
        "To raise the bar, we could add edge cases to the test suite and require error handling. Want me to draft harder assignments?",
    };
  } else if (lastMsg.includes("week") || lastMsg.includes("class")) {
    return {
      content:
        "The course is structured as weeks with classes. Each class focuses on a specific topic and has 1-2 assignments. Want me to add another week or restructure the existing ones?",
    };
  } else {
    return {
      content:
        "That's a great point. The course structure is looking solid. Any specific section you'd like me to refine — the weekly plan, assignments, or rubric?",
    };
  }
}

module.exports = { generateCaseStudy, chatWithMissionControl };
