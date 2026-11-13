
import { UiText } from "@/components/i18n/UiLocale";
import { cn } from "@/lib/utils";

export function BrandMark({ className, variant = "dark" }: { className?: string; variant?: "dark" | "white" }) {
  return <span className={cn("inline-flex h-8 items-center whitespace-nowrap text-xl font-semibold", variant === "white" ? "text-white" : "text-hunter-green", className)}><UiText text={"英语学习空间"} /></span>;
}
