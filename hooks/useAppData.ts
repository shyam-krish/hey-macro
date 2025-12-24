import { useState, useEffect, useRef, useCallback } from 'react';
import { MacroTargets, DailyLog, User } from '../types';
import {
  initDatabase,
  getOrCreateDefaultUser,
  getOrCreateMacroTargets,
  getOrCreateDailyLog,
  updateMacroTargets,
} from '../services/storage';
import { mockTargets, mockDailyLog } from '../constants';

/** Get local date string in YYYY-MM-DD format (avoids UTC timezone issues) */
const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Get date string offset by N days from a given date string */
const getOffsetDateString = (dateStr: string, offsetDays: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offsetDays);
  return getLocalDateString(date);
};

// ==========================================
// TOGGLE: Set to true to use database, false to use mock data
// ==========================================
const USE_DATABASE = true;
// ==========================================

interface AppData {
  user: User | null;
  targets: MacroTargets;
  dailyLog: DailyLog;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectedDate: string;
  changeDate: (date: string) => Promise<void>;
  isToday: boolean;
  updateTargets: (
    newTargets: Omit<MacroTargets, 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  invalidateCache: (date?: string) => void;
}

// Number of days to pre-fetch in each direction
const PREFETCH_DAYS = 7;

/**
 * Hook to manage app data with toggle between database and mock data
 * Includes caching and pre-fetching for smooth date transitions
 */
export function useAppData(): AppData {
  const [user, setUser] = useState<User | null>(null);
  const [targets, setTargets] = useState<MacroTargets>(mockTargets);
  const [dailyLog, setDailyLog] = useState<DailyLog>(mockDailyLog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());

  // Cache for daily logs by date
  const logCache = useRef<Map<string, DailyLog>>(new Map());
  const userRef = useRef<User | null>(null);

  // Pre-fetch surrounding days in background
  const prefetchSurroundingDays = useCallback(async (centerDate: string, userID: string) => {
    if (!USE_DATABASE) return;

    const today = getLocalDateString();
    const datesToFetch: string[] = [];

    // Collect dates to prefetch (past days only, up to today)
    for (let i = -PREFETCH_DAYS; i <= 0; i++) {
      const date = getOffsetDateString(centerDate, i);
      // Don't prefetch future dates, and don't re-fetch if already cached
      if (date <= today && !logCache.current.has(date)) {
        datesToFetch.push(date);
      }
    }

    // Fetch in parallel (silently, no loading state)
    await Promise.all(
      datesToFetch.map(async (date) => {
        try {
          const log = await getOrCreateDailyLog(userID, date);
          logCache.current.set(date, log);
        } catch (err) {
          // Silently fail for prefetch - don't block the UI
          console.warn(`Failed to prefetch ${date}:`, err);
        }
      })
    );
  }, []);

  const loadData = async (date?: string, skipLoadingState = false) => {
    try {
      if (!skipLoadingState) {
        setLoading(true);
      }
      setError(null);

      const targetDate = date || selectedDate;

      if (USE_DATABASE) {
        // Load from database
        await initDatabase();

        let dbUser = userRef.current;
        if (!dbUser) {
          dbUser = await getOrCreateDefaultUser();
          userRef.current = dbUser;
          setUser(dbUser);
        }

        const dbTargets = await getOrCreateMacroTargets(dbUser.userID);
        setTargets(dbTargets);

        // Check cache first
        let dbDailyLog = logCache.current.get(targetDate);
        if (!dbDailyLog) {
          dbDailyLog = await getOrCreateDailyLog(dbUser.userID, targetDate);
          logCache.current.set(targetDate, dbDailyLog);
        }
        setDailyLog(dbDailyLog);

        // Pre-fetch surrounding days in background
        prefetchSurroundingDays(targetDate, dbUser.userID);
      } else {
        // Use mock data
        setUser({
          userID: 'default-user',
          firstName: 'Shyam',
          lastName: 'Krishnan',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        setTargets(mockTargets);
        setDailyLog(mockDailyLog);
      }
    } catch (err) {
      console.error('Failed to load app data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const changeDate = async (newDate: string) => {
    // Check if we have this date cached
    const cachedLog = logCache.current.get(newDate);

    if (cachedLog) {
      // Use cached data immediately (no loading state)
      setSelectedDate(newDate);
      setDailyLog(cachedLog);

      // Refresh in background and update cache
      if (USE_DATABASE && userRef.current) {
        prefetchSurroundingDays(newDate, userRef.current.userID);
      }
    } else {
      // Not cached, load normally with loading state
      setSelectedDate(newDate);
      await loadData(newDate);
    }
  };

  // Invalidate cache for a specific date (call after adding/editing food)
  const invalidateCache = useCallback((date?: string) => {
    if (date) {
      logCache.current.delete(date);
    } else {
      logCache.current.clear();
    }
  }, []);

  // Refresh data for current date (invalidates cache first)
  const refresh = useCallback(async () => {
    invalidateCache(selectedDate);
    await loadData(selectedDate);
  }, [selectedDate, invalidateCache]);

  const updateTargetsHandler = async (
    newTargets: Omit<MacroTargets, 'createdAt' | 'updatedAt'>
  ) => {
    try {
      if (USE_DATABASE) {
        const updated = await updateMacroTargets(newTargets);
        setTargets(updated);

        // Invalidate cache for today since targets affect it
        const today = getLocalDateString();
        invalidateCache(today);

        // Refresh daily log to get updated targets (updateMacroTargets also updates today's log)
        if (selectedDate === today && userRef.current) {
          const refreshedLog = await getOrCreateDailyLog(userRef.current.userID, selectedDate);
          logCache.current.set(selectedDate, refreshedLog);
          setDailyLog(refreshedLog);
        }
      } else {
        // Mock mode: just update state
        setTargets({
          ...newTargets,
          createdAt: targets.createdAt,
          updatedAt: new Date().toISOString(),
        });
        // Also update dailyLog targets in mock mode
        setDailyLog({
          ...dailyLog,
          targetCalories: newTargets.calories,
          targetProtein: newTargets.protein,
          targetCarbs: newTargets.carbs,
          targetFat: newTargets.fat,
        });
      }
    } catch (err) {
      console.error('Failed to update targets:', err);
      throw err;
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const isToday = selectedDate === getLocalDateString();

  return {
    user,
    targets,
    dailyLog,
    loading,
    error,
    refresh,
    selectedDate,
    changeDate,
    isToday,
    updateTargets: updateTargetsHandler,
    invalidateCache,
  };
}
