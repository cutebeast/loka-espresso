"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface UsePaginationOptions {
  defaultPage?: number;
  defaultPerPage?: number;
}

export interface UsePaginationReturn {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  setPage: (page: number) => void;
  setPerPage: (perPage: number) => void;
  setTotal: (total: number) => void;
  setTotalPages: (totalPages: number) => void;
  setPagination: (state: Partial<PaginationState>) => void;
  nextPage: () => void;
  prevPage: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const { defaultPage = 1, defaultPerPage = 20 } = options;
  const [page, setPageState] = useState(defaultPage);
  const [perPage, setPerPageState] = useState(defaultPerPage);
  const [total, setTotalState] = useState(0);
  const [totalPages, setTotalPagesState] = useState(1);

  const setPage = useCallback((p: number) => setPageState(p), []);
  const setPerPage = useCallback((pp: number) => {
    setPerPageState(pp);
    setPageState(1);
  }, []);
  const setTotal = useCallback((t: number) => setTotalState(t), []);
  const setTotalPages = useCallback((tp: number) => setTotalPagesState(tp), []);

  const setPagination = useCallback((state: Partial<PaginationState>) => {
    if (state.page !== undefined) setPageState(state.page);
    if (state.perPage !== undefined) setPerPageState(state.perPage);
    if (state.total !== undefined) setTotalState(state.total);
    if (state.totalPages !== undefined) setTotalPagesState(state.totalPages);
  }, []);

  const nextPage = useCallback(() => setPageState(p => Math.min(p + 1, totalPages)), [totalPages]);
  const prevPage = useCallback(() => setPageState(p => Math.max(p - 1, 1)), []);

  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    page,
    perPage,
    total,
    totalPages,
    setPage,
    setPerPage,
    setTotal,
    setTotalPages,
    setPagination,
    nextPage,
    prevPage,
    hasNext,
    hasPrev,
  };
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  total_pages: number;
  page: number;
}

export function usePaginatedFetch<T>(
  fetchFn: (params: { page: number; per_page: number }) => Promise<PaginatedData<T>>,
  _deps: any[] = [],
  options: UsePaginationOptions = {}
) {
  const pagination = usePagination(options);
  const [data, setData] = useState<PaginatedData<T>>({
    items: [],
    total: 0,
    total_pages: 1,
    page: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const cancelledRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(async (p?: number, pp?: number) => {
    const pageNum = p ?? pagination.page;
    const perPageNum = pp ?? pagination.perPage;
    setLoading(true);
    setError("");
    cancelledRef.current = false;
    try {
      const result = await fetchFn({ page: pageNum, per_page: perPageNum });
      if (!cancelledRef.current) {
        setData(result);
        pagination.setPage(result.page || pageNum);
        pagination.setTotal(result.total || 0);
        pagination.setTotalPages(result.total_pages || 1);
      }
    } catch (e: any) {
      if (!cancelledRef.current) setError(e.message || "Failed to load data");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    fetch(pagination.page, pagination.perPage);
    return () => { cancelledRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.perPage, fetch, ..._deps]);

  return {
    data: data.items,
    total: data.total,
    totalPages: pagination.totalPages,
    page: pagination.page,
    perPage: pagination.perPage,
    loading,
    error,
    setPage: pagination.setPage,
    nextPage: pagination.nextPage,
    prevPage: pagination.prevPage,
    hasNext: pagination.hasNext,
    hasPrev: pagination.hasPrev,
    refresh: () => fetch(pagination.page, pagination.perPage),
  };
}
