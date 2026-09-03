import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      // bg-surface, no border — matches every hand-built input this design
      // already shipped (auth forms, admin modals); a ring is the only
      // focus signal, consistent with the :focus-visible rule in index.css.
      className={cn(
        "h-9 w-full min-w-0 rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none transition-shadow duration-150 selection:bg-accent selection:text-accent-foreground placeholder:text-text-tertiary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "aria-invalid:ring-2 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
