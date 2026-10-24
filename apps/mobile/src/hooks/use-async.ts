import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/api';

/** Small data hook: runs `fn` on mount and whenever `deps` change; `reload()` re-runs it. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fnRef.current()); } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);
  const key = JSON.stringify(deps);
  useEffect(() => { const t = setTimeout(reload, 0); return () => clearTimeout(t); }, [reload, key]);
  return { data, error, loading, reload, setData };
}
