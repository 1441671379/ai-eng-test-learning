// Retained only at migration/wire/history boundaries, never as the app's identity.
export const LEGACY_COOKIE_NAMES: Record<string, string> = {
  english_app_mode: "cadence_app_mode",
  english_local_profile: "cadence_local_profile",
  english_pair_admin: "cadence_pair_admin",
};
export const LEGACY_DESKTOP_USER_AGENT = "CadenceDesktop";
export const LEGACY_PAIRING_SCHEME = "cadence";
export const LEGACY_PAIRING_ADMIN_HEADER = "x-cadence-admin-token";
export const HISTORICAL_SPEAKING_SOURCES = { conversation: "cadence", pronunciation: "openpronounce" } as const;
export const LEGACY_PRONUNCIATION_ENGINE = "openpronounce-baseline";
export const LEGACY_HOME_DIRECTORY = ".cadence";

type CookieReader = { get(name: string): { value: string } | undefined };
export function compatibleCookie(reader: CookieReader, name: string): string | undefined {
  return reader.get(name)?.value ?? (LEGACY_COOKIE_NAMES[name] ? reader.get(LEGACY_COOKIE_NAMES[name])?.value : undefined);
}
export function cookieMigration(reader: CookieReader) {
  return Object.entries(LEGACY_COOKIE_NAMES).flatMap(([name, legacy]) => {
    const old = reader.get(legacy);
    if (!old) return [];
    return [{ name, legacy, value: reader.get(name) ? null : old.value }];
  });
}
export function legacyEnvironment(name: string): string | undefined {
  return process.env[name] ?? process.env[name.replace(/^ENGLISH_/, "CADENCE_")];
}
export function legacyStorageKey(name: string): string | null {
  return name.startsWith("english-") ? name.replace(/^english-/, "cadence-") : null;
}
