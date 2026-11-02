/** Root-relative poster paths belong to the API host, while external/data URLs stay intact. */
export function resolvePosterUrl(url: string, apiBase = import.meta.env.VITE_API_URL || '/api'): string {
  if (!url.startsWith('/') || url.startsWith('//') || !/^https?:\/\//i.test(apiBase)) return url;
  return new URL(url, apiBase).href;
}
