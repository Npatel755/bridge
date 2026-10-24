import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api';

/** Small data hook: runs `fn` on mount and whenever `deps` change; `reload()` re-runs it. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true); setError(null);
    try {
      const next = await fnRef.current();
      if (my === seq.current) setData(next);
    } catch (e) {
      if (my === seq.current) setError(errorMessage(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);
  const key = JSON.stringify(deps);
  useEffect(() => { const t = setTimeout(reload, 0); return () => clearTimeout(t); }, [reload, key]);
  return { data, error, loading, reload, setData };
}
