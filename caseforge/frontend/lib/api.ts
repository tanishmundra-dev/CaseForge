const API = "http://localhost:8000/api";

export async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
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
