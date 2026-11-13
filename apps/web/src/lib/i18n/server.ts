import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, translate } from ".";
import type { Metadata } from "next";
export async function getUiLocale() { return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value); }
export async function localizedMetadata(value: Metadata): Promise<Metadata> {
  const locale = await getUiLocale(), title = value.title;
  const translatedTitle = typeof title === "string" ? translate(title, locale) : title && "absolute" in title ? { ...title, absolute: translate(title.absolute, locale) } : title && "default" in title ? { ...title, default: translate(title.default, locale), template: typeof title.template === "string" ? translate(title.template, locale) : title.template } : title;
  return { ...value,
    title: translatedTitle,
    description: typeof value.description === "string" ? translate(value.description, locale) : value.description };
}
