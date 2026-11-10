/**
 * Same-path hash / query deep links cannot rely on Next.js `<Link>` alone:
 * soft navigation uses `history.pushState` and never fires `hashchange`, so My Day
 * tabs that listen for the hash never switch (Review appears to do nothing).
 */
export function followSamePathDeepLink(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return false;
  }
  if (url.pathname !== window.location.pathname) return false;

  const next = `${url.pathname}${url.search}${url.hash}`;
  if (url.search !== window.location.search) {
    window.location.assign(next);
    return true;
  }
  if (url.hash !== window.location.hash) {
    window.location.hash = url.hash;
    return true;
  }
  // Already on the target — re-signal so Approve sub-tabs re-select.
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  return true;
}
