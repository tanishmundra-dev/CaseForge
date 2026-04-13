const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function fetchAPI(path: string, options?: RequestInit) {
  const token = typeof window !== "undefined" ? localStorage.getItem("caseforge_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error || body.message || "";
    } catch { /* no json body */ }
    throw new Error(detail || `API error: ${res.status}`);
  }
  return res.json();
}
