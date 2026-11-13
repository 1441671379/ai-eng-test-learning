import { NextResponse, type NextRequest } from "next/server";
import { cookieMigration } from "@/lib/compatibility/legacy";
import { APP_MODE_COOKIE, getAppModeCookieOptions } from "@/lib/app-mode";
import { createDefaultLocalProfile, LOCAL_PROFILE_COOKIE, readLocalProfileFromCookies, writeLocalProfile } from "@/lib/local-profile";
export function proxy(request: NextRequest) {
  const migrations = cookieMigration(request.cookies);
  for (const item of migrations) if (item.value !== null) request.cookies.set(item.name, item.value);
  const existing = readLocalProfileFromCookies(request.cookies);
  const profile = existing ?? createDefaultLocalProfile();
  request.cookies.set(APP_MODE_COOKIE, "local");
  request.cookies.set(LOCAL_PROFILE_COOKIE, JSON.stringify(profile));
  const url = request.nextUrl.clone();
  if (url.pathname === "/experiments" || url.pathname.startsWith("/experiments/")) url.pathname = url.pathname.replace(/^\/experiments/, "/speaking");
  if (["/setup", "/login", "/signup", "/forgot-password", "/reset-password", "/onboarding"].includes(url.pathname)) url.pathname = "/dashboard";
  const response = url.pathname !== request.nextUrl.pathname ? NextResponse.redirect(url) : NextResponse.next({ request });
  response.cookies.set(APP_MODE_COOKIE, "local", getAppModeCookieOptions());
  if (!existing || migrations.some(item => item.name === LOCAL_PROFILE_COOKIE && item.value !== null)) writeLocalProfile(response.cookies, profile);
  for (const item of migrations) {
    if (item.value !== null && item.name !== APP_MODE_COOKIE && item.name !== LOCAL_PROFILE_COOKIE) response.cookies.set(item.name, item.value, {
      ...getAppModeCookieOptions(), httpOnly: true,
      ...(item.name === "english_pair_admin" ? { maxAge: 60 * 60 * 8, secure: false } : {}),
    });
    response.cookies.set(item.legacy, "", { path: "/", maxAge: 0 });
  }
  return response;
}
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
