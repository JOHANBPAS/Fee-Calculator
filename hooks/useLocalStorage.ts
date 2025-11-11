
import { useState, useEffect } from 'react';

export function useLocalStorageNumber(key: string, initial: number) {
  const [val, setVal] = useState<number>(() => {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return initial;
        const n = Number(raw);
        return Number.isFinite(n) ? n : initial;
    } catch {
        return initial;
    }
  });
  useEffect(() => {
    try {
        localStorage.setItem(key, String(val));
    } catch (e) {
        console.error(`Failed to set localStorage key "${key}"`, e);
    }
  }, [key, val]);
  return [val, setVal] as const;
}

export function useLocalStorageString(key: string, initial: string) {
  const [val, setVal] = useState<string>(() => {
    try {
        const raw = localStorage.getItem(key);
        return raw ?? initial;
    } catch {
        return initial;
    }
  });
  useEffect(() => {
    try {
        localStorage.setItem(key, val);
    } catch (e) {
        console.error(`Failed to set localStorage key "${key}"`, e);
    }
  }, [key, val]);
  return [val, setVal] as const;
}

export function useLocalStorageState<T>(key: string, initial: T) {
  const [val, setVal] = useState<T>(() => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return initial;
        return JSON.parse(raw) as T;
    } catch {
        return initial;
    }
  });
  useEffect(() => {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
        console.error(`Failed to set localStorage key "${key}"`, e);
    }
  }, [key, val]);
  return [val, setVal] as const;
}
