"use client";
import { useEffect, useRef } from "react";

/** Live analyser data only: no synthetic motion during silence or pause. */
export function AudioColumns({ analyser, active, label }: { analyser: AnalyserNode | null; active: boolean; label: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = root.current; if (!node) return;
    const columns = Array.from(node.querySelectorAll<HTMLElement>("i")), reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, visible = true, last = 0;
    const data = new Uint8Array(analyser?.frequencyBinCount || 128);
    const speechBand = analyser ? Math.min(data.length - 1, Math.round(8000 / (analyser.context.sampleRate / 2) * data.length)) : data.length - 1;
    const settle = () => columns.forEach(column => { column.style.transform = "scaleY(.035)"; });
    const draw = (now: number) => {
      if (!active || !analyser || reduced.matches || document.hidden || !visible) { frame = 0; settle(); return; }
      if (now - last >= 1000 / 30) {
        analyser.getByteFrequencyData(data); last = now;
        columns.forEach((column, index) => {
          const bin = Math.round((index / (columns.length - 1)) ** 1.7 * speechBand);
          const amplitude = (data[bin] + (data[Math.min(bin + 1, data.length - 1)] || 0)) / 510;
          column.style.transform = `scaleY(${Math.max(.035, amplitude ** 1.25)})`;
        });
      }
      frame = requestAnimationFrame(draw);
    };
    const sync = () => { cancelAnimationFrame(frame); frame = 0; if (active && analyser && !document.hidden && visible && !reduced.matches) frame = requestAnimationFrame(draw); else settle(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(node); document.addEventListener("visibilitychange", sync); reduced.addEventListener("change", sync); sync();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", sync); reduced.removeEventListener("change", sync); settle(); };
  }, [active, analyser]);
  return <div ref={root} className="listening-columns" data-active={active} role="img" aria-label={label}>{Array.from({ length: 48 }, (_, index) => <i key={index} aria-hidden="true" />)}</div>;
}
