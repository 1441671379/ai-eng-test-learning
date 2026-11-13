export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSharedServices, localDesktopRoot } = await import("./lib/services/lifecycle");
    if (localDesktopRoot()) void ensureSharedServices().catch(error => console.warn("Shared services automatic startup:", error.message));
  }
}
