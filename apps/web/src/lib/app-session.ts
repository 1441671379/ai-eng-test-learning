import "server-only";

import { redirect } from "next/navigation";
import type { AppMode } from "@/lib/app-mode";
import type { LocalProfile } from "@/lib/local-profile";
import { getLocalProfile } from "@/lib/local-profile";
import { resolveDeviceFromRequest } from "@/lib/pairing/request";
import { getSharedProfile } from "@/lib/pairing/service";

export interface AppUser {
  id: string;
  email: string | null;
  createdAt: string;
  displayName: string;
  practiceFocus: string | null;
  practiceCadence: string | null;
  onboardingCompleted: boolean;
  isLocal: boolean;
  meta: Record<string, unknown>;
}

export interface AppSession {
  mode: AppMode | null;
  user: AppUser | null;
}

export async function getAppSession(): Promise<AppSession> {
  // A phone paired to this computer over the LAN presents a paired device
  // token. It is checked before anything else: the token names the identity,
  // and no cookie or Supabase session on the wire may override it.
  const device = await resolveDeviceFromRequest();
  if (device) {
    if (!device.ok) {
      // The token was ours but is revoked or expired. Returning "no user"
      // rather than falling through keeps a stale phone from silently landing
      // in some other identity; the route answers 401 and the phone unpairs.
      return { mode: "local", user: null };
    }

    const profile = await getSharedProfile();
    return {
      mode: "local",
      user: mapLocalProfileToAppUser({
        id: profile.id,
        displayName: profile.displayName,
        practiceFocus: "conversations",
        practiceCadence: "15-minutes",
        createdAt: profile.createdAt,
        onboardingCompleted: true,
      }),
    };
  }

  const profile = await getLocalProfile();
  return { mode: "local", user: profile ? mapLocalProfileToAppUser(profile) : null };
}

export async function requireAppUser(pathname: string) {
  const session = await getAppSession();

  if (session.mode === "local" && session.user) {
    return session as AppSession & { user: AppUser; mode: "local" };
  }

  if (session.mode === "cloud" && session.user) {
    return session as AppSession & { user: AppUser; mode: "cloud" };
  }

  if (session.mode === "cloud") {
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  redirect(`/setup?next=${encodeURIComponent(pathname)}`);
}

function mapLocalProfileToAppUser(profile: LocalProfile): AppUser {
  return {
    id: profile.id,
    email: null,
    createdAt: profile.createdAt,
    displayName: profile.displayName,
    practiceFocus: profile.practiceFocus,
    practiceCadence: profile.practiceCadence,
    onboardingCompleted: profile.onboardingCompleted,
    isLocal: true,
    meta: {},
  };
}

