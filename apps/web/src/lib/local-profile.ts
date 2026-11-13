import { compatibleCookie, LEGACY_COOKIE_NAMES } from "./compatibility/legacy";
import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export const LOCAL_PROFILE_COOKIE = "english_local_profile";

const LOCAL_PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type CookieValue = { value: string } | undefined;

type CookieReader = {
  get(name: string): CookieValue;
};

type CookieWriter = CookieReader & {
  set(
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ): unknown;
};

export interface LocalProfile {
  id: string;
  displayName: string;
  practiceFocus: string;
  practiceCadence: string;
  createdAt: string;
  onboardingCompleted: boolean;
}

export function createDefaultLocalProfile(): LocalProfile {
  return {
    id: `local-${randomUUID()}`,
    displayName: "Local learner",
    practiceFocus: "conversations",
    practiceCadence: "15-minutes",
    createdAt: new Date().toISOString(),
    onboardingCompleted: true,
  };
}

export function parseLocalProfile(
  value: string | null | undefined,
): LocalProfile | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<LocalProfile> | null;

    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.practiceFocus !== "string" ||
      typeof parsed.practiceCadence !== "string" ||
      typeof parsed.createdAt !== "string"
    ) {
      return null;
    }

    return {
      id: parsed.id,
      displayName: parsed.displayName,
      practiceFocus: parsed.practiceFocus,
      practiceCadence: parsed.practiceCadence,
      createdAt: parsed.createdAt,
      onboardingCompleted: parsed.onboardingCompleted !== false,
    };
  } catch {
    return null;
  }
}

export function readLocalProfileFromCookies(
  cookieStore: CookieReader,
): LocalProfile | null {
  return parseLocalProfile(compatibleCookie(cookieStore, LOCAL_PROFILE_COOKIE));
}

export async function getLocalProfile(): Promise<LocalProfile | null> {
  return readLocalProfileFromCookies(await cookies());
}

export function writeLocalProfile(
  cookieStore: CookieWriter,
  profile: LocalProfile,
) {
  cookieStore.set(LEGACY_COOKIE_NAMES[LOCAL_PROFILE_COOKIE], "", { path: "/", maxAge: 0 });
  cookieStore.set(LOCAL_PROFILE_COOKIE, JSON.stringify(profile), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ENGLISH_PACKAGED_RUNTIME !== "1" && process.env.ENGLISH_LOCAL_HTTP !== "1",
    maxAge: LOCAL_PROFILE_COOKIE_MAX_AGE,
  });
}
