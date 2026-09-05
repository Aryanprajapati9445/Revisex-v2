import { FileText, MessageCircle, HardDrive, Image as ImageIcon } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { StatusPill } from "@/components/layout/StatusPill";

const SCATTERED = [
  { icon: MessageCircle, label: "WhatsApp group", rotate: "-rotate-6", offset: "translate-y-2" },
  { icon: HardDrive, label: "Drive folder", rotate: "rotate-3", offset: "-translate-y-1" },
  { icon: ImageIcon, label: "Screenshot", rotate: "-rotate-2", offset: "translate-y-3" },
  { icon: FileText, label: "Random PDF", rotate: "rotate-6", offset: "-translate-y-2" },
];

// Two hand-built card stacks, not stock imagery: a scattered pile of chat-app
// / drive / screenshot chips on the left settling into one ordered list on
// the right — same shapes and tokens as the rest of the app, just rearranged.
export function ProblemSection() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div className="flex max-w-lg flex-col gap-4">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          Your notes shouldn&rsquo;t live in five different places.
        </h2>
        <p className="text-ui text-text-muted">
          WhatsApp groups. Google Drive links that expire. Screenshots you can&rsquo;t search. By
          exam week, nobody remembers which PDF is the final syllabus version — or whether the
          link even still works.
        </p>
      </div>

      <Reveal className="relative flex h-64 items-center justify-center gap-10 sm:h-72">
        <div className="relative size-40 shrink-0 sm:size-44" aria-hidden="true">
          {SCATTERED.map((item, index) => (
            <div
              key={item.label}
              className={`absolute inset-0 m-auto flex h-16 w-32 flex-col items-start justify-center gap-1 rounded-card border border-border bg-surface px-3 shadow-raised ${item.rotate} ${item.offset}`}
              style={{ zIndex: index }}
            >
              <item.icon className="size-3.5 text-text-tertiary" strokeWidth={2} />
              <span className="text-caption text-text-muted">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="hidden text-text-tertiary sm:block" aria-hidden="true">
          <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
            <path
              d="M1 8h24m0 0-6-6m6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          className="w-40 shrink-0 rounded-panel border border-border bg-surface shadow-floating sm:w-48"
          aria-hidden="true"
        >
          <div className="border-b border-border px-3 py-2 text-caption font-medium text-text-primary">
            Notes
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {["Data Structures", "Thermodynamics"].map((title) => (
              <li key={title} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="truncate text-caption text-text-primary">{title}</span>
                <StatusPill status="approved" />
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </div>
  );
}
