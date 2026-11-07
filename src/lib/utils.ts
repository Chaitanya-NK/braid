import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn's class helper: joins classes and resolves Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Turns "Weekend Builders!" into "weekend-builders". */
export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Two-letter initials for avatars: "Asha Shetty" → "AS". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Cursor and avatar colours. All pass 4.5:1 contrast with white text. */
export const MEMBER_COLORS = [
  "#C2410C", // orange
  "#1D4ED8", // blue
  "#BE185D", // pink
  "#0F766E", // teal
  "#6D28D9", // violet
  "#B45309", // amber
  "#047857", // green
  "#4338CA", // indigo
];

export function pickColor(seed: number) {
  return MEMBER_COLORS[Math.abs(seed) % MEMBER_COLORS.length];
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 min ago", "yesterday"… */
export function timeAgo(date: Date, now: Date = new Date()) {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/** Whole minutes between two times, at least 1. */
export function minutesBetween(from: Date, to: Date) {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 60_000));
}
