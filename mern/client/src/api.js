export const API = (import.meta.env.VITE_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
export async function api(path, { method = "GET", body, token } = {}) {
  let response;
  const isFormData = body instanceof FormData;
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (isFormData) delete headers["Content-Type"];
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {})
    });
  } catch {
    throw new Error("Can't reach the AquaFlow server. Check that the API is running on port 5000.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const err = new Error(data.message || "Something went wrong. Please try again."); err.status = response.status; throw err; }
  return data;
}
