import { createContext, type Dispatch, type SetStateAction } from "react";

export interface CommandPaletteValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

/**
 * Lives in its own module so CommandPaletteProvider.tsx exports only a
 * component — React Fast Refresh degrades to a full reload for any module that
 * mixes component and non-component exports (same reason as auth-context.ts).
 */
export const CommandPaletteContext = createContext<CommandPaletteValue | null>(null);
