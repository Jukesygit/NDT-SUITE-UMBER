import { useState, useCallback } from 'react';

const STORAGE_KEY = 'companion-recent-dirs';
const MAX_RECENT = 8;

export function useRecentDirectories() {
  const [directories, setDirectories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const addDirectory = useCallback((dir: string) => {
    setDirectories((prev) => {
      const filtered = prev.filter((d) => d !== dir);
      const updated = [dir, ...filtered].slice(0, MAX_RECENT);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch { /* quota exceeded */ }
      return updated;
    });
  }, []);

  const removeDirectory = useCallback((dir: string) => {
    setDirectories((prev) => {
      const updated = prev.filter((d) => d !== dir);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
  }, []);

  return { directories, addDirectory, removeDirectory };
}
