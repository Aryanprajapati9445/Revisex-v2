// Deliberately not a fabricated testimonial — no invented name, photo, or
// university. A plain statement of intent, plus the three trust markers the
// backend actually enforces (moderation on every upload, free access,
// taxonomy-first organization) rather than invented adoption numbers.
export function PullQuote() {
  return (
    <div className="flex flex-col gap-8 rounded-panel border border-border bg-surface-elevated p-8 sm:p-10">
      <p className="max-w-2xl text-title font-semibold tracking-tight text-text-primary">
        &ldquo;Course notes end up scattered across chats, drives, and forgotten folders. This is
        one place for them instead.&rdquo;
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-ui text-text-muted">
        <span>Free for students</span>
        <span>Community-reviewed</span>
        <span>Organized by course</span>
      </div>
    </div>
  );
}
