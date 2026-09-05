import { useEffect, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  duration?: number;
};

const STEP_MS = 16;

export function AnimatedNumber({ value, duration = 900 }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setDisplay(0);
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(Math.round(progress * value));
      if (progress >= 1) clearInterval(interval);
    }, STEP_MS);
    // Interval ticks land at multiples of STEP_MS, which won't always
    // coincide with `duration` exactly — this guarantees the count
    // actually reaches `value` instead of stalling a tick short of it.
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplay(value);
    }, duration);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [value, duration]);

  return <span>{display.toLocaleString()}</span>;
}
