
import { UiText, UiLink } from "@/components/i18n/UiLocale";
import Link from "next/link";
import { Settings } from "griddy-icons";
import { BrandMark } from "@/components/ui/brand-mark";
import { NavbarFrame } from "@/components/ui/navbar-frame";
import { getAppSession } from "@/lib/app-session";
import { getRequestRuntime } from "@/lib/services/runtime";
import { cn } from "@/lib/utils";
import { learningModules, type LearningModuleId } from "@/lib/learning-modules";

type NavKey = LearningModuleId | "records" | "settings" | "experiments" | "dashboard" | "home" | "login" | "signup" | "profile";
interface NavbarProps { current?: NavKey; variant?: "default" | "dark"; }
const navBaseClass = "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap";

export async function Navbar({ current, variant = "default" }: NavbarProps) {
  const session = await getAppSession();
  const runtime = await getRequestRuntime();
  const isAuthenticated = Boolean(session.user);
  const activeKey = current === "profile" ? "settings" : current;
  const navItems: { href: string; key: NavKey; label: string }[] = isAuthenticated
    ? [
        { href: "/dashboard", key: "dashboard", label: "首页" },
        ...learningModules.map(module => ({ href: module.href, key: module.id, label: module.label })),
        { href: "/records", key: "records", label: "学习记录" },
      ]
    : [{ href: "/login", key: "login", label: "Login" }, { href: "/signup", key: "signup", label: "Sign up" }];
  const isDark = variant === "dark";
  const inactiveClass = isDark ? "bg-white/10 text-bright-snow hover:bg-white/20" : "bg-vanilla-cream text-hunter-green hover:bg-[#eadfbe]";
  const activeClass = "bg-yellow-green text-hunter-green";
  return <NavbarFrame variant={variant} runtime={runtime}>
    <Link href={isAuthenticated ? "/dashboard" : "/"} className="flex h-11 items-center justify-center self-center">
      <UiText text={isAuthenticated ? <span className="whitespace-nowrap text-xl font-semibold"><UiText text={"英语学习空间"} /></span> : <BrandMark variant={isDark ? "white" : "dark"} />} />
    </Link>
    <div className="flex flex-wrap items-center gap-2 self-center">
      <UiText text={navItems.map(item => <Link key={item.key} href={item.href} className={cn(navBaseClass,
        activeKey === item.key || item.key === "signup" && !isAuthenticated ? activeClass : inactiveClass)}><UiText text={item.label} /></Link>)} />
      <UiText text={isAuthenticated ? <UiLink href="/settings" className={cn(navBaseClass, "min-h-11 w-11 px-0", activeKey === "settings" ? activeClass : inactiveClass)} aria-label="用户与设置" title={session.user?.displayName}>
        <Settings size={18} color="currentColor" />
      </UiLink> : null} />
    </div>
  </NavbarFrame>;
}
