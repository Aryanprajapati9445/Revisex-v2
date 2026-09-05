import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CursorGlowProps = {
  children: ReactNode;
  className?: string;
};

export function CursorGlow({ children, className }: CursorGlowProps) {
  const [position, setPosition] = useState({ x: 50, y: 50 });

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPosition({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <div className={cn("relative", className)} onPointerMove={handlePointerMove}>
      <div
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={
          {
            backgroundImage:
              "radial-gradient(480px circle at var(--glow-x) var(--glow-y), color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 70%)",
            "--glow-x": `${position.x}%`,
            "--glow-y": `${position.y}%`,
          } as CSSProperties
        }
      />
      {children}
    </div>
  );
}
