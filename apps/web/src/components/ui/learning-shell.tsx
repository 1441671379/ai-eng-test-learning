"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { learningModules } from "@/lib/learning-modules";
import { useUiLocale } from "@/components/i18n/UiLocale";
import { getPianoCopy } from "@/components/learning/piano-copy";
import { PianoIcon } from "./piano-icon";
import { PracticeActions, PracticeModuleLink } from "@/components/learning/PracticeContinuity";

export function LearningShell({ children, desktop, displayName }: { children: React.ReactNode; desktop: boolean; displayName: string }) {
  const { locale, t } = useUiLocale(); const copy = getPianoCopy(locale); const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [inputMode, setInputMode] = useState<"keyboard" | "pointer">("keyboard");
  const menu = useRef<HTMLButtonElement>(null); const sidebar = useRef<HTMLElement>(null); const previousPath = useRef(pathname); const navigationWasOpen = useRef(false);
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const pageName = active("/dashboard") ? copy.home : active("/records") ? copy.records : active("/settings") || active("/profile") ? copy.settings : t(learningModules.find(module => active(module.href))?.name ?? copy.space);
  useEffect(() => { if (previousPath.current === pathname) return; previousPath.current = pathname; const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("#learning-content h1")?.focus()); return () => cancelAnimationFrame(frame); }, [pathname]);
  useEffect(() => { if (navigationOpen) sidebar.current?.querySelector<HTMLAnchorElement>("a[aria-current='page']")?.focus(); else if (navigationWasOpen.current) menu.current?.focus(); navigationWasOpen.current = navigationOpen; }, [navigationOpen]);
  useEffect(() => { const media = window.matchMedia("(min-width: 651px)"); const syncNavigation = () => { setMobileNavigation(!media.matches); if (media.matches) setNavigationOpen(false); }; syncNavigation(); media.addEventListener("change", syncNavigation); return () => media.removeEventListener("change", syncNavigation); }, []);
  function closeNavigation() { setNavigationOpen(false); }
  return <div className={`learning-shell${desktop ? " learning-shell--desktop" : ""}`} data-input={inputMode} onPointerDownCapture={() => setInputMode("pointer")} onKeyDownCapture={() => setInputMode("keyboard")} onClickCapture={event => { if (event.detail === 0) setInputMode("keyboard"); }}>
    <a className="piano-skip" href="#learning-content">{copy.skip}</a>
    <aside className="piano-sidebar" id="learning-navigation" ref={sidebar} data-open={navigationOpen} inert={mobileNavigation && !navigationOpen} aria-label={copy.modules} onKeyDown={event => {
      if (event.key === "Escape") closeNavigation();
      if (navigationOpen && event.key === "Tab") {
        const links = sidebar.current?.querySelectorAll<HTMLAnchorElement>("a");
        const first = links?.[0], last = links?.[links.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      
      <Link href="/dashboard" className="piano-brand" onClick={() => setNavigationOpen(false)}><span className="piano-brand-mark" aria-hidden="true"><i /><i /><i /></span><span>{copy.space}{locale !== "en" && <small>ENGLISH LEARNING</small>}</span></Link>
      <nav aria-label={copy.modules}><Link href="/dashboard" className="piano-nav-home" aria-current={active("/dashboard") ? "page" : undefined} onClick={() => setNavigationOpen(false)}><span>{copy.home}</span>{locale !== "en" && <small>Overview</small>}</Link><div className="piano-nav-rule" />{learningModules.map(module => <PracticeModuleLink key={module.id} module={module.id} aria-current={active(module.href) ? "page" : undefined} onClick={() => setNavigationOpen(false)}><span>{t(module.label)}</span>{locale !== "en" && <small>{module.english[0] + module.english.slice(1).toLowerCase()}</small>}</PracticeModuleLink>)}</nav>
      <div className="piano-sidebar-bottom"><Link href="/records" aria-current={active("/records") ? "page" : undefined} onClick={() => setNavigationOpen(false)}><span>{copy.records}</span>{locale !== "en" && <small>Records</small>}</Link><Link href="/settings" aria-current={active("/settings") || active("/profile") ? "page" : undefined} onClick={() => setNavigationOpen(false)}><span>{copy.settings}</span>{locale !== "en" && <small>Settings</small>}</Link><div className="piano-identity"><span aria-hidden="true" className="piano-identity-dot" /><span title={displayName}>{displayName}<small>{copy.local}</small></span></div></div>
    </aside>
    <button className="piano-navigation-backdrop" data-open={navigationOpen} inert={!navigationOpen} tabIndex={-1} aria-label={copy.closeMenu} onClick={closeNavigation} />
    <div className="piano-main-column" inert={navigationOpen}><header className="piano-app-header"><div className="piano-breadcrumb"><button className="piano-icon-button piano-menu-button" ref={menu} type="button" aria-label={navigationOpen ? copy.closeMenu : copy.menu} aria-expanded={navigationOpen} aria-controls="learning-navigation" onClick={() => setNavigationOpen(value => !value)}><PianoIcon name="menu" /></button><Link href="/dashboard">{copy.space}</Link><span aria-hidden="true">/</span><span>{pageName}</span></div><div className="piano-practice-actions"><PracticeActions /><Link className="piano-header-language" href="/settings" aria-label={copy.language}>{locale === "en" ? "English" : "中文"}</Link></div></header><div id="learning-content" className="piano-content" tabIndex={-1}>{children}</div></div>
  </div>;
}
