import { motion, type HTMLMotionProps, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

type StaggerProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

export function Stagger({ children, ...props }: StaggerProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      variants={containerVariants}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...props }: StaggerProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={props.className}>{children}</div>;

  return (
    <motion.div variants={itemVariants} {...props}>
      {children}
    </motion.div>
  );
}
