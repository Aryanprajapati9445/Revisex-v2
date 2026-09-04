import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { cn } from "@/lib/utils";
import { useToggleBookmark } from "./queries";

/**
 * Save / unsave a note.
 *
 * Hidden entirely when signed out rather than shown-and-failing: there is
 * nowhere for an anonymous person's saved notes to live, so offering the
 * control would promise something the account model cannot keep.
 */
export function BookmarkButton({
  noteId,
  saved,
  variant = "button",
}: {
  noteId: string;
  saved: boolean;
  variant?: "button" | "icon";
}) {
  const { status } = useAuth();
  const toggle = useToggleBookmark(noteId);

  if (status !== "authenticated") return null;

  const label = saved ? "Saved — click to remove" : "Save this note";

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={saved}
        disabled={toggle.isPending}
        onClick={(event) => {
          // The card is wrapped in a link; saving must not navigate.
          event.preventDefault();
          event.stopPropagation();
          toggle.mutate(!saved);
        }}
        className="rounded-control p-1.5 text-text-tertiary transition-colors duration-150 hover:bg-surface hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
      >
        <Bookmark
          className={cn("size-4", saved && "fill-current text-primary")}
          strokeWidth={2}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={saved ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={saved}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate(!saved)}
    >
      <Bookmark
        className={cn("size-4", saved && "fill-current text-primary")}
        strokeWidth={2}
        aria-hidden="true"
      />
      {saved ? "Saved" : "Save"}
    </Button>
  );
}
