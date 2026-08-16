import { storage } from "@/src/utils/storage";
import { API } from "@/src/theme";

const TOKEN_KEY = "sunshine_token";

export async function getToken(): Promise<string> {
  return (await storage.getItem<string>(TOKEN_KEY, "")) || "";
}
export async function setToken(t: string) {
  await storage.setItem(TOKEN_KEY, t);
}
export async function clearToken() {
  await storage.removeItem(TOKEN_KEY);
}

type Options = { method?: string; body?: any; auth?: boolean };

export async function apiFetch<T = any>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && (data.detail || data.message)) || `Something went wrong (${res.status})`);
  }
  return data as T;
}

// Fire-and-forget activity logging (elder only)
export function logActivity(feature: string) {
  apiFetch("/activity", { method: "POST", body: { feature } }).catch(() => {});
}
