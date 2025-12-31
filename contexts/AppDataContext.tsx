import React, { createContext, useContext, ReactNode } from 'react';
import { MacroTargets, DailyLog, User } from '../types';

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
  updateUser: (
    newUser: Omit<User, 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  invalidateCache: (date?: string) => void;
}

const AppDataContext = createContext<AppData | null>(null);

interface AppDataProviderProps {
  children: ReactNode;
  value: AppData;
}

export function AppDataProvider({ children, value }: AppDataProviderProps) {
  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}

export function useAppDataContext(): AppData {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppDataContext must be used within an AppDataProvider');
  }
  return context;
}
