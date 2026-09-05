import { type HTMLMotionProps, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import type { PointerEvent, ReactNode } from "react";

type TiltProps = Omit<
  HTMLMotionProps<"div">,
  "children" | "style" | "onPointerMove" | "onPointerLeave"
> & {
  children?: ReactNode;
  strength?: number;
};

export function Tilt({ children, strength = 8, ...props }: TiltProps) {
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const springConfig = { stiffness: 300, damping: 30 };
  const rotateX = useSpring(useTransform(py, [0, 1], [strength, -strength]), springConfig);
  const rotateY = useSpring(useTransform(px, [0, 1], [-strength, strength]), springConfig);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  }

  function handlePointerLeave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      style={{ perspective: "var(--perspective-hero)", rotateX, rotateY }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      {...props}
    >
      {children}
    </motion.div>
  );
}
