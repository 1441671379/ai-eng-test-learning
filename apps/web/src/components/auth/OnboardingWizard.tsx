"use client";

import { UiText, UiElement } from "@/components/i18n/UiLocale";
// FILE: src/components/auth/OnboardingWizard.tsx

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SplitText } from "@/components/ui/split-text";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function OnboardingWizard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("conversations");
  const [cadence, setCadence] = useState("15-minutes");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          onboardingCompleted: true,
          displayName: name.trim(),
          practiceFocus: focus,
          practiceCadence: cadence,
        },
      });

      if (updateError) throw updateError;

      router.replace("/dashboard");
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Could not save your onboarding preferences.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden p-4 sm:p-5 lg:p-6">
      <div className="grid h-full gap-4 lg:grid-cols-[0.94fr_1.06fr]">

        {/* ── Left — brand panel (hidden on mobile) ────────────────────── */}
        <Card className="relative hidden overflow-hidden bg-hunter-green text-bright-snow lg:flex">
          <div className="relative z-10 flex h-full flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-yellow-green">
                <UiText text={" Welcome to English Learning "} /></div>
              <div className="space-y-5">
                <SplitText
                  tag="h1"
                  text="Set up a sharper practice flow before the first session."
                  className="text-4xl font-semibold leading-tight xl:text-5xl"
                  delay={18}
                  duration={640}
                />
                <p className="max-w-xl text-base leading-7 text-bright-snow/70">
                  <UiText text={" We only need a quick sense of your focus so the dashboard can open in the right place and keep your repetition loop clean. "} /></p>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center">
              <Image
                src="/illustration/following-your-dreams-1.svg"
                alt=""
                width={300}
                height={260}
                className="w-full max-w-[280px] select-none opacity-90"
                priority
              />
            </div>

            <div className="grid gap-3 grid-cols-2">
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82"><UiText text={"Best for"} /></p>
                <p className="mt-2 text-base font-semibold"><UiText text={"Daily pronunciation reps"} /></p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82"><UiText text={"After this"} /></p>
                <p className="mt-2 text-base font-semibold"><UiText text={"Quick practice opens right away"} /></p>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Right — form panel ────────────────────────────────────────── */}
        <Card className="flex flex-col overflow-y-auto bg-vanilla-cream lg:overflow-hidden">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6 py-6">

            {/* Mobile eyebrow */}
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full bg-hunter-green/10 px-4 py-2 text-sm font-semibold text-hunter-green lg:hidden">
                <UiText text={" Welcome to English Learning "} /></div>
              <div className="space-y-4">
                <p className="eyebrow text-sm text-sage-green hidden lg:block"><UiText text={"Setup"} /></p>
                <h2 className="text-3xl font-semibold text-hunter-green">
                  <UiText text={" Tell English Learning how you want to practice. "} /></h2>
                <p className="text-sm leading-7 text-iron-grey">
                  <UiText text={" You can change these later. This just gives the workspace a better starting point. "} /></p>
              </div>
            </div>

            <div className="space-y-7">
              <label className="block">
                <span className="block text-sm font-semibold text-hunter-green pb-1">
                  <UiText text={" What should we call you? "} /></span>
                <div className="flex items-center rounded-full bg-white px-5 py-1 ring-1 ring-transparent focus-within:ring-sage-green">
                  <UiElement as="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-transparent py-2 text-sm text-hunter-green placeholder:text-iron-grey/60 focus:outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-sm font-semibold text-hunter-green pb-1">
                  <UiText text={" What do you want to focus on first? "} /></span>
                <Select
                  variant="white"
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                >
                  <option value="conversations"><UiText text={"Conversation confidence"} /></option>
                  <option value="vowels"><UiText text={"Short and long vowel control"} /></option>
                  <option value="work"><UiText text={"Clearer speaking at work"} /></option>
                  <option value="daily"><UiText text={"Daily speaking fluency"} /></option>
                </Select>
              </label>

              <label className="block">
                <span className="block text-sm font-semibold text-hunter-green pb-1">
                  <UiText text={" What kind of pace feels realistic? "} /></span>
                <Select
                  variant="white"
                  value={cadence}
                  onChange={(event) => setCadence(event.target.value)}
                >
                  <option value="5-minutes"><UiText text={"5 minutes a day"} /></option>
                  <option value="15-minutes"><UiText text={"15 minutes a day"} /></option>
                  <option value="30-minutes"><UiText text={"30 minutes a day"} /></option>
                  <option value="weekend-only"><UiText text={"A few times a week"} /></option>
                </Select>
              </label>
            </div>

            <UiText text={error ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                <UiText text={error} />
              </div>
            ) : null} />

            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              <ArrowRight size={16} color="currentColor" />
              <UiText text={isSaving ? "Saving..." : "Open my dashboard"} />
            </Button>
          </div>
        </Card>

      </div>
    </div>
  );
}
