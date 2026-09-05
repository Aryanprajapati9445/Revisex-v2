import { LayoutGrid, ShieldCheck, Search, Upload as UploadIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Browse by course",
    body: "Find notes using your program, branch, semester, and subject.",
  },
  {
    icon: ShieldCheck,
    title: "Community reviewed",
    body: "Every upload goes through review before appearing in the library.",
  },
  {
    icon: Search,
    title: "Search instantly",
    body: "Find the exact subject or topic without digging through old chats.",
  },
  {
    icon: UploadIcon,
    title: "Give back",
    body: "Upload your notes and help the next student prepare faster.",
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
