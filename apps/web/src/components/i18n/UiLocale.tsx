"use client";

import { createContext, useContext, useEffect, createElement, type ReactNode, type ComponentPropsWithRef, type JSX } from "react";
import { translate, type UiLocale } from "@/lib/i18n";
import Link from "next/link";
const Context = createContext<UiLocale>("zh-CN");
export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <Context.Provider value={locale}>{children}</Context.Provider>;
}
export function useUiLocale() {
  const locale = useContext(Context);
  return { locale, t: (text: string) => translate(text, locale), dateLocale: locale === "en" ? "en-US" : "zh-CN" };
}
export function UiText({ text }: { text: ReactNode }) {
  const { t } = useUiLocale();
  return <>{Array.isArray(text) ? text.map(value => typeof value === "string" ? t(value) : value) : typeof text === "string" ? t(text) : text}</>;
}
export function UiElement<T extends keyof JSX.IntrinsicElements>({ as, ...props }: { as: T } & ComponentPropsWithRef<T>) {
  const { t } = useUiLocale();
  const attributes = { ...props } as Record<string, unknown>;
  for (const name of ["placeholder", "title", "aria-label", "alt"]) if (typeof attributes[name] === "string") attributes[name] = t(attributes[name]);
  return createElement(as, attributes);
}
export function UiLink(props: ComponentPropsWithRef<typeof Link>) {
  const { t } = useUiLocale();
  return <Link {...props} aria-label={typeof props["aria-label"] === "string" ? t(props["aria-label"]) : props["aria-label"]} title={typeof props.title === "string" ? t(props.title) : props.title} />;
}
