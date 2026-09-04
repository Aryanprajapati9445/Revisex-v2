import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CommandPaletteContext } from "@/hooks/command-palette-context";

/**
 * Holds the palette's open state above both the palette itself and anything
 * that wants to open it (the console's search field, a button, a menu item).
 * Without it every caller of useCommandPalette got its own useState, so a
 * trigger toggled a boolean the rendered palette never read.
 */
export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <CommandPaletteContext value={value}>{children}</CommandPaletteContext>;
}
