import { cn } from "@/lib/utils";

export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground",
        "h-5 min-w-[20px]",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
