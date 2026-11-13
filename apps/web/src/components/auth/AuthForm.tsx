"use client";

import { UiText, UiLink } from "@/components/i18n/UiLocale";
// FILE: src/components/auth/AuthForm.tsx

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import type { AppRuntime } from "@/lib/services/runtime";
import { cn } from "@/lib/utils";

interface AuthFormProps {
  mode: "login" | "signup";
  runtime: AppRuntime;
}

export function AuthForm({ mode, runtime }: AuthFormProps) {
  const router = useRouter();
  const isLogin = mode === "login";
  const isDesktop = runtime === "desktop";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    try {
      setIsSubmitting(true);

      if (!isSupabaseConfigured) {
        throw new Error(
          "Add your Supabase URL and publishable key in .env.local before testing authentication.",
        );
      }

      const supabase = createSupabaseBrowserClient();

      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          throw authError;
        }

        setMessage("Login successful. Taking you to the dashboard.");
        startTransition(() => {
          router.replace("/dashboard");
          router.refresh();
        });
        return;
      }

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo:
            typeof window === "undefined"
              ? undefined
              : `${window.location.origin}/api/auth/confirm?next=/onboarding`,
        },
      });

      if (authError) {
        throw authError;
      }

      setMessage(
        "Account created. Check your inbox for the Supabase confirmation email, then sign in.",
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Something went wrong during authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isDesktop) {
    return (
      <Card className="w-full max-w-[30rem] bg-transparent p-0 backdrop-blur-0">
        <div className="space-y-6">
          <div className="space-y-4 px-5 sm:px-6">
            <UiLink href="/" className="inline-flex w-fit items-center" aria-label="Go to home">
              <span className="text-xl font-bold text-hunter-green"><UiText text={"英语学习空间"} /></span>
            </UiLink>

            <div className="space-y-3">
              <CardTitle className="text-[2rem] leading-tight sm:text-[2.15rem]">
                <UiText text={isLogin ? "Sign in to English Learning" : "Start your pronunciation profile"} />
              </CardTitle>
              <CardDescription className="text-base">
                <UiText text={isLogin
                  ? "Return to your saved rounds and next coaching cue."
                  : "Create your learner account and begin tracking progress."} />
              </CardDescription>
            </div>
          </div>

          <form
            className="space-y-4 px-5 py-1 sm:px-6"
            onSubmit={handleSubmit}
          >
            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green"><UiText text={"Email"} /></span>
              <Input
                type="email"
                autoComplete="email"
                placeholder="learner@english.app"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="bg-white"
              />
            </label>

            <label className="block">
              <span className="block pb-2 text-sm font-medium text-hunter-green"><UiText text={"Password"} /></span>
              <Input
                type="password"
                autoComplete={isLogin ? "current-password" : "new-password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="bg-white"
              />
            </label>

            <UiText text={message ? (
              <div className="rounded-3xl bg-yellow-green px-4 py-3 text-sm text-hunter-green">
                <UiText text={message} />
              </div>
            ) : null} />

            <UiText text={error ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                <UiText text={error} />
              </div>
            ) : null} />

            <Button className="w-full" type="submit" disabled={isSubmitting}>
              <UiText text={isSubmitting
                ? isLogin
                  ? "Signing in..."
                  : "Creating account..."
                : isLogin
                  ? "Sign in"
                  : "Create account"} />
            </Button>

            <UiText text={isLogin ? (
              <div className="pt-1 text-right">
                <Link href="/forgot-password" className="text-sm font-semibold text-sage-green">
                  <UiText text={" Forgot password? "} /></Link>
              </div>
            ) : null} />
          </form>

          <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
            <UiText text={isLogin ? "Need an account?" : "Already have an account?"} /><UiText text={" "} />
            <Link
              href={isLogin ? "/signup" : "/login"}
              className="font-semibold text-sage-green"
            >
              <UiText text={isLogin ? "Create one here." : "Sign in here."} />
            </Link>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "w-full max-w-[32rem] p-0 backdrop-blur-0",
        isDesktop
          ? "bg-transparent shadow-none"
          : "bg-transparent shadow-none",
      )}
    >
      <div className="space-y-6">
        <div className="space-y-4 px-5 sm:px-6">
          <div className="inline-flex w-fit items-center">
            <span className="text-xl font-bold text-hunter-green"><UiText text={"英语学习空间"} /></span>
          </div>

          <div className="space-y-3">
            <CardTitle className="text-[2rem] leading-tight sm:text-[2.15rem]">
              <UiText text={isLogin ? "Sign in to English Learning" : "Start your pronunciation profile"} />
            </CardTitle>
            <CardDescription className="text-base">
              <UiText text={isLogin
                ? "Return to your saved rounds and next coaching cue."
                : "Create your learner account and begin tracking progress."} />
            </CardDescription>
          </div>
        </div>

        <form
          className={cn(
            "space-y-4 px-5 py-1 sm:px-6",
            isDesktop
              ? ""
              : "border border-[#e6d9bd] bg-white px-6 py-6 shadow-[0_20px_64px_rgba(41,66,45,0.08)] sm:px-7 sm:py-7 lg:px-8",
          )}
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="block pb-2 text-sm font-medium text-hunter-green"><UiText text={"Email"} /></span>
            <Input
              type="email"
              autoComplete="email"
              placeholder="learner@english.app"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="bg-white"
            />
          </label>

          <label className="block">
            <span className="block pb-2 text-sm font-medium text-hunter-green"><UiText text={"Password"} /></span>
            <Input
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="bg-white"
            />
          </label>

          <UiText text={message ? (
            <div className="rounded-3xl bg-yellow-green px-4 py-3 text-sm text-hunter-green">
              <UiText text={message} />
            </div>
          ) : null} />

          <UiText text={error ? (
            <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
              <UiText text={error} />
            </div>
          ) : null} />

          <Button className="w-full" type="submit" disabled={isSubmitting}>
            <UiText text={isSubmitting
              ? isLogin
                ? "Signing in..."
                : "Creating account..."
              : isLogin
                ? "Sign in"
                : "Create account"} />
          </Button>

          <UiText text={isLogin ? (
            <div className="pt-1 text-right">
              <Link href="/forgot-password" className="text-sm font-semibold text-sage-green">
                <UiText text={" Forgot password? "} /></Link>
            </div>
          ) : null} />
        </form>

        <p className="px-5 text-sm leading-7 text-iron-grey sm:px-6">
          <UiText text={isLogin ? "Need an account?" : "Already have an account?"} /><UiText text={" "} />
          <Link
            href={isLogin ? "/signup" : "/login"}
            className="font-semibold text-sage-green"
          >
            <UiText text={isLogin ? "Create one here." : "Sign in here."} />
          </Link>
        </p>
      </div>
    </Card>
  );
}
