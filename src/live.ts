// A live query for screens that need extra data (settings, sheets), kept while the screen is open.

import { useEffect, useState } from "preact/hooks";
import { subscribe } from "./backend";

/** `skip`: nothing is read (a page's count for someone the query isn't for). */
export function useQuery<T>(fn: Parameters<typeof subscribe>[0], args: Record<string, unknown>, skip = false): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const key = JSON.stringify(args);
  useEffect(() => {
    if (skip) {
      setValue(undefined);
      return;
    }
    return subscribe(
      fn,
      args as never,
      (v) => setValue(v as T),
      () => setValue(undefined),
    );
  }, [key, skip]);
  return value;
}
