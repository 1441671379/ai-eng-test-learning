"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_SPEAKING_DISPLAY, type SpeakingDisplayPreferences } from "@/lib/speaking-display";

const SpeakingDisplayContext = createContext<SpeakingDisplayPreferences>(DEFAULT_SPEAKING_DISPLAY);

export function SpeakingDisplayProvider({ preferences, children }: { preferences: SpeakingDisplayPreferences; children: ReactNode }) {
  return <SpeakingDisplayContext.Provider value={preferences}>{children}</SpeakingDisplayContext.Provider>;
}

export function useSpeakingDisplay() { return useContext(SpeakingDisplayContext); }
