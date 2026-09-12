import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, ...props }: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-control text-text-tertiary transition-colors duration-150 hover:text-text-primary focus-visible:text-text-primary focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff className="size-4" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Eye className="size-4" strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
