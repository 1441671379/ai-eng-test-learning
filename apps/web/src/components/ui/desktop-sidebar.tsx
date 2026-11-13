"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/ui/brand-mark";
import { learningModules } from "@/lib/learning-modules";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "首页" },
  ...learningModules
    .map(module => ({ href: module.href, label: module.name })),
  { href: "/records", label: "学习记录" },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-white text-hunter-green">
      <div className="h-[52px] shrink-0" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />
      <Link href="/dashboard" className="px-6 pb-6"><BrandMark /></Link>
      <UiElement as="nav" aria-label="学习模块" className="flex flex-1 flex-col gap-1 overflow-y-auto px-4">
        <UiText text={items.map(item => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}
          className={cn("rounded-full px-4 py-3 text-base font-semibold", isActive(item.href) ? "bg-yellow-green" : "hover:bg-vanilla-cream")}>
          <UiText text={item.label} />
        </Link>)} />
      </UiElement>
      <Link href="/settings" className={cn("m-4 rounded-full px-4 py-3 font-semibold", isActive("/settings") || isActive("/profile") ? "bg-yellow-green" : "hover:bg-vanilla-cream")}><UiText text={"用户与设置"} /></Link>
    </aside>
  );
}
