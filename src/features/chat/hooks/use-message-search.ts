"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MessageSearchResult } from "@/db/queries/chat-conversations";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

export function useMessageSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateQuery = useCallback((value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, DEBOUNCE_MS);
  }, []);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["message-search", debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.length < MIN_QUERY_LENGTH) return { results: [] };
      const res = await fetch(
        `/api/v1/conversations/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`,
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json() as Promise<{ results: MessageSearchResult[] }>;
    },
    enabled: debouncedQuery.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
  });

  return {
    query,
    updateQuery,
    results: data?.results ?? [],
    isLoading: isLoading && debouncedQuery.length >= MIN_QUERY_LENGTH,
    error,
    hasQuery: debouncedQuery.length >= MIN_QUERY_LENGTH,
  };
}
