import { useEffect, useMemo, useState } from 'react';
import { catalogService } from '@/services/catalog';

export function useCatalogSets() {
  const [sets, setSets] = useState<Awaited<ReturnType<typeof catalogService.listSets>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void catalogService.listSets().then(next => { if (active) { setSets(next); setError(false); } })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const sorted = useMemo(() => [...sets].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id)), [sets]);
  return { sets: sorted, loading, error, retry: () => { setLoading(true); setError(false); setAttempt(previous => previous + 1); } };
}
