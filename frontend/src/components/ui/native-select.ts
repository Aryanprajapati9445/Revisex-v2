/**
 * The class list for a plain `<select>`.
 *
 * Several screens use a native select rather than the Radix one: a short list
 * of options with no search and no custom rendering doesn't earn a popover, and
 * the native control is what a phone renders best. They were each carrying
 * their own copy of these classes, which is how one of them ended up without
 * the border and disappeared inside a dialog — a select is bg-surface and so is
 * DialogContent, so the fill alone marks nothing.
 *
 * Matches Input's geometry (h-9 is the button/input height across this design)
 * so a row mixing the two lines up.
 */
export const nativeSelectClass =
  "h-9 w-full min-w-0 rounded-control border border-border bg-surface px-2.5 py-1.5 text-ui text-text-primary outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
