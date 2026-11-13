"use client";
import { readLocalStorage } from "@/lib/browser-storage";
import { useSyncExternalStore } from "react";
function snapshot() { try { return readLocalStorage("english-tts-voice") || ""; } catch { return ""; } }
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("english-tts-voice", callback);
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("english-tts-voice", callback);
    window.removeEventListener("focus", callback);
  };
}
export function useTtsVoiceRevision() { return useSyncExternalStore(subscribe, snapshot, () => ""); }
