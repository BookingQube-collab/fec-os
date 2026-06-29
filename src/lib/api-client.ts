type ApiGetInit = Pick<RequestInit, "priority">;

/** Client-side fetch helper for authenticated API route handlers. */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  init?: ApiGetInit,
): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const res = await fetch(url.toString(), { credentials: "include", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
