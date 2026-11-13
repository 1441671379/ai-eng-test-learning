export function isSameOrigin(request: Request) {
  try { const origin = new URL(request.headers.get("origin") ?? ""); return origin.host === request.headers.get("host") && origin.protocol === new URL(request.url).protocol; }
  catch { return false; }
}
