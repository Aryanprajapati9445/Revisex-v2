import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A note's score, read-only. Used on cards, where five buttons per note would
 * be five hundred tab stops on a listing page.
 */
export function RatingDisplay({
  average,
  count,
  className,
}: {
  average: number;
  count: number;
  className?: string;
}) {
  if (count === 0) {
    return <span className={cn("text-caption text-text-tertiary", className)}>Not rated yet</span>;
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-caption text-text-tertiary", className)}
      // One label for the whole control: a screen reader should hear the score,
      // not five separate star graphics.
      aria-label={`Rated ${average.toFixed(1)} out of 5 by ${count} ${count === 1 ? "person" : "people"}`}
    >
      <Star className="size-3.5 fill-current text-status-approved-fg" strokeWidth={0} aria-hidden="true" />
      <span className="font-medium text-text-primary">{average.toFixed(1)}</span>
      <span aria-hidden="true">({count})</span>
    </span>
  );
}

/**
 * The interactive version, on note detail only.
 *
 * Radio semantics rather than five toggle buttons: a rating is one choice out
 * of five, and a radiogroup is what lets arrow keys move between them.
 * Re-picking the current value clears it, which is the only way to withdraw a
 * rating without a separate destructive control.
 */
export function RatingInput({
  value,
  onRate,
  disabled,
  disabledReason,
}: {
  value: number | null;
  onRate: (rating: number | null) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  if (disabled) {
    return <p className="text-caption text-text-tertiary">{disabledReason ?? "You cannot rate this note."}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Your rating"
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(null)}
            onClick={() => onRate(value === star ? null : star)}
            className="rounded-control p-0.5 transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Star
              className={cn(
                "size-6 transition-colors duration-150",
                star <= shown ? "fill-current text-status-approved-fg" : "text-text-tertiary"
              )}
              strokeWidth={star <= shown ? 0 : 1.5}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {value !== null && (
        <button
          type="button"
          onClick={() => onRate(null)}
          className="text-caption text-text-muted underline hover:text-text-primary"
        >
          Clear
        </button>
      )}
    </div>
  );
}
