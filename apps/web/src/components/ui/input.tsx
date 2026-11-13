"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { UiElement } from "@/components/i18n/UiLocale";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <UiElement as="input"
      ref={ref}
      className={cn(
        "min-h-12 w-full rounded-full bg-white px-4 py-3 text-sm text-hunter-green placeholder:text-slate-grey disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
