import { cn } from "@/lib/utils.js";

export function Button({ className, variant = "default", type = "button", ...props }) {
  return <button type={type} className={cn("btn", `btn-${variant}`, className)} {...props} />;
}
