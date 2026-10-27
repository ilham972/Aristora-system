// A live query for screens that need extra data (settings, sheets), kept while the screen is open.

import { useEffect, useState } from "preact/hooks";
import { subscribe } from "./backend";

export function useQuery<T>(fn: Parameters<typeof subscribe>[0], args: Record<string, unknown>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const key = JSON.stringify(args);
  useEffect(
    () =>
      subscribe(
        fn,
        args as never,
        (v) => setValue(v as T),
        () => setValue(undefined),
      ),
    [key],
  );
  return value;
}
