import { AlertCircleIcon, CheckCircle2Icon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "error";

const styles: Record<AlertVariant, string> = {
  info: "border-border bg-muted/50 text-foreground",
  success: "border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400",
  error: "border-destructive/30 bg-destructive/5 text-destructive",
};

const icons: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  error: AlertCircleIcon,
};

/** Inline alert for form/action feedback (accessible, compact). */
export function Alert({
  variant = "info",
  children,
  className,
  role,
}: {
  variant?: AlertVariant;
  children: React.ReactNode;
  className?: string;
  role?: string;
}) {
  const Icon = icons[variant];
  return (
    <div
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
        styles[variant],
        className
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
