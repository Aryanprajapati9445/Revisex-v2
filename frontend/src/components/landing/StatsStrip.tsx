const STATS = [
  { label: "Organized by program, branch & subject" },
  { label: "Every upload reviewed before it's approved" },
  { label: "Free for every student, always" },
];

export function StatsStrip() {
  return (
    <div className="grid gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-3">
      {STATS.map((stat) => (
        <div key={stat.label} className="bg-surface px-5 py-4 text-center sm:text-left">
          <p className="text-ui font-medium text-text-primary">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
