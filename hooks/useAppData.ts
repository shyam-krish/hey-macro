import { useState, useEffect } from 'react';
import { MacroTargets, DailyLog, User } from '../types';
import {
  initDatabase,
  getOrCreateDefaultUser,
  getOrCreateMacroTargets,
  getOrCreateDailyLog,
  updateMacroTargets,
} from '../services/storage';
import { mockTargets, mockDailyLog } from '../constants';

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
}

/**
 * Hook to manage app data with toggle between database and mock data
 */
export function useAppData(): AppData {
  const [user, setUser] = useState<User | null>(null);
  const [targets, setTargets] = useState<MacroTargets>(mockTargets);
  const [dailyLog, setDailyLog] = useState<DailyLog>(mockDailyLog);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const loadData = async (date?: string) => {
    try {
      setLoading(true);
      setError(null);

      const targetDate = date || selectedDate;

      if (USE_DATABASE) {
        // Load from database
        await initDatabase();

        const dbUser = await getOrCreateDefaultUser();
        setUser(dbUser);

        const dbTargets = await getOrCreateMacroTargets(dbUser.userID);
        setTargets(dbTargets);

        const dbDailyLog = await getOrCreateDailyLog(dbUser.userID, targetDate);
        setDailyLog(dbDailyLog);
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
    setSelectedDate(newDate);
    await loadData(newDate);
  };

  const updateTargetsHandler = async (
    newTargets: Omit<MacroTargets, 'createdAt' | 'updatedAt'>
  ) => {
    try {
      if (USE_DATABASE) {
        const updated = await updateMacroTargets(newTargets);
        setTargets(updated);

        // Refresh daily log to get updated targets (updateMacroTargets also updates today's log)
        const today = new Date().toISOString().split('T')[0];
        if (selectedDate === today && user) {
          const refreshedLog = await getOrCreateDailyLog(user.userID, selectedDate);
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

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return {
    user,
    targets,
    dailyLog,
    loading,
    error,
    refresh: loadData,
    selectedDate,
    changeDate,
    isToday,
    updateTargets: updateTargetsHandler,
  };
}
