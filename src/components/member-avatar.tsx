import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

/** A teammate's avatar in their cursor colour (the same colour Phase 1 uses for live cursors). */
export function MemberAvatar({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)} title={name}>
      <AvatarFallback className="text-xs font-semibold text-white" style={{ background: color }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
