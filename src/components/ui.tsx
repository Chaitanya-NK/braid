import type { ComponentProps } from "react";
import { cn, initials } from "@/lib/utils";

/* Small shared building blocks. Kept in one file while the app is young. */

type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "danger";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink-2",
  brand: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-zinc-300 bg-surface text-ink hover:bg-zinc-50",
  ghost: "text-ink-2 hover:bg-zinc-100",
  danger: "border border-red-300 bg-surface text-danger hover:bg-red-50",
};

export function buttonClass(variant: ButtonVariant = "primary", extra?: string) {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    buttonStyles[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-zinc-400 bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-ink", className)} {...props} />;
}

export function Avatar({
  name,
  color,
  size = 30,
  className,
}: {
  name: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.4) }}
    >
      {initials(name)}
    </span>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
