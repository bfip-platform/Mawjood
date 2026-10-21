import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boundedLoad } from './withTimeout';
import { reportTelemetry } from './crash-guard';

/** Why a load failed: the deadline won, or the loader rejected. */
export type LoadFailure = 'timeout' | 'error';

export interface PaginatedList<T> {
  /** rows loaded so far (page 1 + appended pages) */
  data: T[];
  /** direct setter — existing local mutations (toggle/delete/prepend) keep working */
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  /** true while the first page loads */
  loading: boolean;
  /** true while a "load more" page is in flight */
  loadingMore: boolean;
  /** false once the server returned a short page */
  hasMore: boolean;
  /**
   * First-page failure of the latest refresh (Product Foundation wave):
   * the load is bounded, so a failure ALWAYS lands here instead of an
   * eternal spinner or a silent fake-empty list. Null while healthy.
   */
  error: LoadFailure | null;
  /** Same classification for a failed "load more" page. */
  moreError: LoadFailure | null;
  /** append the next page (no-op while loading or when !hasMore) */
  loadMore: () => void;
  /**
   * Reload page 1. Uses the latest loader by default; pass an explicit loader
   * when the caller knows fresher params than the last render (e.g. right
   * after setViewSpace, before re-render).
   */
  refresh: (loader?: (offset: number, limit: number) => Promise<T[]>) => void;
  /** Re-run whichever load failed last (refresh or load-more). */
  retry: () => void;
}

interface Opts {
  /** rows per page (default 10) */
  pageSize?: number;
  /** per-load deadline in ms (default 15000) — a stalled network fails visibly */
  timeoutMs?: number;
  /** static surface name for telemetry labels (never user content) */
  surface?: string;
}

/**
 * Generic infinite-scroll list. ONE implementation consumed by every tab:
 * the tab only supplies `(offset, limit) => Promise<rows>` and renders
 * `data` in a FlatList with `onEndReached={loadMore}`.
 *
 * Offset is tracked as pages-loaded × pageSize (not data.length), so local
 * prepends/filters never shift server pages. Appended rows are de-duplicated
 * by id. A sequence guard drops stale responses after refresh().
 *
 * Product Foundation hardening: every load runs under `boundedLoad`, so a
 * stalled connection resolves as a classified failure (`error`/`moreError`)
 * the UI can show with a retry button — and the failure is reported to
 * telemetry with the surface name only. A failed refresh keeps any rows
 * already on screen (stale data beats a white page).
 */
export function usePaginatedList<T extends { id: string }>(opts: Opts = {}): PaginatedList<T> {
  const pageSize = opts.pageSize ?? 10;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const surface = opts.surface ?? 'list';
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<LoadFailure | null>(null);
  const [moreError, setMoreError] = useState<LoadFailure | null>(null);

  const loaderRef = useRef<((offset: number, limit: number) => Promise<T[]>) | null>(null);
  const seqRef = useRef(0);
  const pageRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    (loader?: (offset: number, limit: number) => Promise<T[]>) => {
      if (loader) loaderRef.current = loader;
      const run = loaderRef.current;
      if (!run) return;
      const seq = ++seqRef.current;
      pageRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
      setError(null);
      setMoreError(null);
      setLoading(true);
      void boundedLoad(run(0, pageSize), timeoutMs).then((res) => {
        if (!mountedRef.current || seqRef.current !== seq) return;
        if (res.status === 'ok') {
          setData(res.value);
          pageRef.current = 1;
          const more = res.value.length >= pageSize;
          hasMoreRef.current = more;
          setHasMore(more);
        } else {
          setError(res.status);
          reportTelemetry('list-load', `${surface}-refresh-${res.status}`);
        }
        setLoading(false);
      });
    },
    [pageSize, timeoutMs, surface],
  );

  const loadMore = useCallback(() => {
    const run = loaderRef.current;
    if (!run || loadingMoreRef.current || !hasMoreRef.current) return;
    const seq = seqRef.current;
    loadingMoreRef.current = true;
    setMoreError(null);
    setLoadingMore(true);
    void boundedLoad(run(pageRef.current * pageSize, pageSize), timeoutMs).then((res) => {
      loadingMoreRef.current = false;
      if (!mountedRef.current || seqRef.current !== seq) {
        setLoadingMore(false);
        return;
      }
      if (res.status === 'ok') {
        const rows = res.value;
        if (rows.length === 0) {
          hasMoreRef.current = false;
          setHasMore(false);
        } else {
          setData((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const fresh = rows.filter((r) => !seen.has(r.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          pageRef.current += 1;
          const more = rows.length >= pageSize;
          hasMoreRef.current = more;
          setHasMore(more);
        }
      } else {
        setMoreError(res.status);
        reportTelemetry('list-load', `${surface}-more-${res.status}`);
      }
      setLoadingMore(false);
    });
  }, [pageSize, timeoutMs, surface]);

  const retry = useCallback(() => {
    if (error) {
      refresh();
    } else if (moreError) {
      loadMore();
    }
  }, [error, moreError, refresh, loadMore]);

  return useMemo(
    () => ({ data, setData, loading, loadingMore, hasMore, error, moreError, loadMore, refresh, retry }),
    [data, loading, loadingMore, hasMore, error, moreError, loadMore, refresh, retry],
  );
}
