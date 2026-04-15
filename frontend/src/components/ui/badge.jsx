import { cn } from "@/lib/utils.js";

export function Badge({ className, tone = "default", ...props }) {
  return <span className={cn("badge", `badge-${tone}`, className)} {...props} />;
}
