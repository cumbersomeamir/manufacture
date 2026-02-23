const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload
      ? payload.message || payload.error || `Request failed: ${response.status}`
      : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body || {}) });
}

export function apiPatch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body || {}) });
}

export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}
