import { useContext, useEffect, useState } from "react";
import { CommandPaletteContext, type CommandPaletteValue } from "./command-palette-context";

/**
 * Prefers the shared state from CommandPaletteProvider so a trigger elsewhere
 * in the tree opens the same palette. Falls back to its own local state when no
 * provider is above it, which keeps the palette usable — and testable — in
 * isolation rather than throwing on a missing provider for what is a UI
 * convenience, not a security boundary.
 */
export function useCommandPalette(): CommandPaletteValue {
  const shared = useContext(CommandPaletteContext);
  const [open, setOpen] = useState(false);
  const isStandalone = shared === null;

  useEffect(() => {
    // The provider already owns the shortcut; a second listener here would
    // toggle twice per keypress and leave the palette exactly as it was.
    if (!isStandalone) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStandalone]);

  return shared ?? { open, setOpen };
}
