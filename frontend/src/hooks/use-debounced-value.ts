import { useEffect, useState } from "react";

/**
 * Holds a value back until it stops changing. Every admin list here filters
 * server-side, so without this each keystroke is its own request and the last
 * response to arrive wins — which is not necessarily the last one typed.
 *
 * 250ms is short enough that the list feels live and long enough to swallow a
 * burst of typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
