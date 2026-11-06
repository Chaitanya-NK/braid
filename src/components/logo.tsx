import Link from "next/link";

/** Braid mark: two strands crossing. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <path
        d="M6 4c0 7 16 7 16 14s-16 3-16 6"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M22 4c0 7-16 7-16 14s16 3 16 6"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
      <LogoMark />
      Braid
    </Link>
  );
}
