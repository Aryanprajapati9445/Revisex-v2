import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      // bg-surface with a hairline border. The fill alone used to be the only
      // thing marking the field, which made every input inside a Dialog
      // invisible — DialogContent is bg-surface too, so field and panel were
      // literally the same colour. The border is what makes a field read as a
      // field on whichever surface it lands on; the ring stays the focus
      // signal, consistent with the :focus-visible rule in index.css.
      className={cn(
        "h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2.5 py-1.5 text-ui outline-none transition-shadow duration-150 selection:bg-accent selection:text-accent-foreground placeholder:text-text-tertiary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "aria-invalid:ring-2 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
