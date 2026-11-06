"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  exact = false,
  children,
}: {
  href: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center gap-2.5 rounded-lg px-2.5",
        active ? "bg-brand-soft font-medium text-brand-strong" : "text-zinc-700 hover:bg-accent",
      )}
    >
      {children}
    </Link>
  );
}
