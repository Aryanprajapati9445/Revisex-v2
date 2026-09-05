import { LayoutGrid, ShieldCheck, Search, Upload as UploadIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Browse by course",
    body: "Filter by program, branch, semester, and subject — not endless scrolling.",
  },
  {
    icon: ShieldCheck,
    title: "Community reviewed",
    body: "Every upload is checked before it reaches the library.",
  },
  {
    icon: Search,
    title: "Search instantly",
    body: "Type a subject or topic and skip the old chat threads entirely.",
  },
  {
    icon: UploadIcon,
    title: "Give back",
    body: "Upload the notes that helped you, and help the next student too.",
  },
] as const;

export function Features() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FEATURES.map((feature, index) => (
        <Reveal
          key={feature.title}
          transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.05 }}
          className="flex flex-col gap-3 rounded-panel border border-border bg-surface p-6"
        >
          <span className="flex size-9 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <feature.icon className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>
          <h3 className="text-ui font-semibold text-text-primary">{feature.title}</h3>
          <p className="text-ui text-text-muted">{feature.body}</p>
        </Reveal>
      ))}
    </div>
  );
}
