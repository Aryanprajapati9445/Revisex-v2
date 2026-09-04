import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type RevealProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

export function Reveal({ children, ...props }: RevealProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
