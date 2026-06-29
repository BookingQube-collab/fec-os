const CHUNK_LOAD_RE = /Loading chunk .* failed/i;

export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "ChunkLoadError" || CHUNK_LOAD_RE.test(error.message);
  }
  return CHUNK_LOAD_RE.test(String(error));
}

/** Retry dynamic imports when dev HMR invalidates chunk URLs. */
export async function retryImport<T>(
  loader: () => Promise<T>,
  options?: { retries?: number; delayMs?: number },
): Promise<T> {
  const retries = options?.retries ?? 3;
  const delayMs = options?.delayMs ?? 800;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;
      if (!isChunkLoadError(error) || attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  if (isChunkLoadError(lastError) && typeof window !== "undefined") {
    const reloadKey = "fec:chunk-reload";
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, "1");
      window.location.reload();
      return new Promise(() => {});
    }
    sessionStorage.removeItem(reloadKey);
  }

  throw lastError;
}
