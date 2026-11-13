import type { ReactNode, SVGProps } from "react";
type IconName = "arrow-right" | "arrow-left" | "plus" | "play" | "pause" | "check" | "close" | "menu";
const paths: Record<IconName, ReactNode> = {
  "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6" />, "arrow-left": <path d="M19 12H5m6-6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />, play: <path d="m9 5 11 7-11 7Z" />, pause: <path d="M9 5v14M16 5v14" />,
  check: <path d="m5 12 4 4L19 6" />, close: <path d="m6 6 12 12M18 6 6 18" />, menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};
export function PianoIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
