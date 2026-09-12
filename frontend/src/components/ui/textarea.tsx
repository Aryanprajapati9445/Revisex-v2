import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // border, for the same reason Input carries one: inside a Dialog the
        // fill matches the panel exactly, so without it the field vanishes.
        "flex field-sizing-content min-h-16 w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-ui outline-none transition-shadow duration-150 placeholder:text-text-tertiary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
