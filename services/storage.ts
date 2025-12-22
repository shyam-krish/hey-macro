/**
 * SQLite storage service for Hey Macro app
 * Handles all database operations
 */

import 'react-native-get-random-values'; // Must be imported before uuid
import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import type { User, MacroTargets, FoodEntry, DailyLog, FoodItem, LLMResponse, DateCalorieData } from '../types';

const DATABASE_NAME = 'heymacro.db';
const DEFAULT_USER_ID = 'default-user';
const DEFAULT_USER_FIRST_NAME = 'Shyam';
const DEFAULT_USER_LAST_NAME = 'Krishnan';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Helper: Get current timestamp as ISO string
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Helper: Get today's date as YYYY-MM-DD
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}


/**
 * Initialize the database and create tables
 */
export async function initDatabase(): Promise<void> {
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        userID TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      -- Macro targets table
      CREATE TABLE IF NOT EXISTS macro_targets (
        userID TEXT PRIMARY KEY,
        calories INTEGER NOT NULL,
        protein INTEGER NOT NULL,
        carbs INTEGER NOT NULL,
        fat INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES users(userID)
      );

      -- Daily logs table
      CREATE TABLE IF NOT EXISTS daily_logs (
        dailyLogID TEXT PRIMARY KEY,
        userID TEXT NOT NULL,
        date TEXT NOT NULL,
        totalCalories INTEGER DEFAULT 0,
        totalProtein INTEGER DEFAULT 0,
        totalCarbs INTEGER DEFAULT 0,
        totalFat INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES users(userID)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_logs_user_date
        ON daily_logs(userID, date);

      -- Food entries table
      CREATE TABLE IF NOT EXISTS food_entries (
        foodEntryID TEXT PRIMARY KEY,
        userID TEXT NOT NULL,
        dailyLogID TEXT NOT NULL,
        mealType TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity TEXT NOT NULL,
        calories INTEGER NOT NULL,
        protein INTEGER NOT NULL,
        carbs INTEGER NOT NULL,
        fat INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userID) REFERENCES users(userID),
        FOREIGN KEY (dailyLogID) REFERENCES daily_logs(dailyLogID)
      );

      CREATE INDEX IF NOT EXISTS idx_food_entries_daily_log
        ON food_entries(dailyLogID);
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get or create the default user for MVP
 */
export async function getOrCreateDefaultUser(): Promise<User> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Try to get existing default user
    const result = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE userID = ?',
      [DEFAULT_USER_ID]
    );

    if (result) {
      return result;
    }

    // Create default user if doesn't exist
    const now = getCurrentTimestamp();
    await db.runAsync(
      'INSERT INTO users (userID, firstName, lastName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
      [DEFAULT_USER_ID, DEFAULT_USER_FIRST_NAME, DEFAULT_USER_LAST_NAME, now, now]
    );

    return {
      userID: DEFAULT_USER_ID,
      firstName: DEFAULT_USER_FIRST_NAME,
      lastName: DEFAULT_USER_LAST_NAME,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Failed to get or create default user:', error);
    throw error;
  }
}

/**
 * Get or create macro targets for a user
 */
export async function getOrCreateMacroTargets(userID: string): Promise<MacroTargets> {
  if (!db) throw new Error('Database not initialized');

  try {
    const targets = await db.getFirstAsync<MacroTargets>(
      'SELECT * FROM macro_targets WHERE userID = ?',
      [userID]
    );

    if (targets) {
      return targets;
    }

    // Create default targets
    const now = getCurrentTimestamp();
    const defaultTargets: MacroTargets = {
      userID,
      calories: 2700,
      protein: 150,
      carbs: 300,
      fat: 90,
      createdAt: now,
      updatedAt: now,
    };

    await db.runAsync(
      'INSERT INTO macro_targets (userID, calories, protein, carbs, fat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userID, defaultTargets.calories, defaultTargets.protein, defaultTargets.carbs, defaultTargets.fat, now, now]
    );

    return defaultTargets;
  } catch (error) {
    console.error('Failed to get or create macro targets:', error);
    throw error;
  }
}

/**
 * Update macro targets
 */
export async function updateMacroTargets(
  targets: Omit<MacroTargets, 'createdAt' | 'updatedAt'>
): Promise<MacroTargets> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();
    const existing = await db.getFirstAsync<MacroTargets>(
      'SELECT * FROM macro_targets WHERE userID = ?',
      [targets.userID]
    );

    await db.runAsync(
      'UPDATE macro_targets SET calories = ?, protein = ?, carbs = ?, fat = ?, updatedAt = ? WHERE userID = ?',
      [targets.calories, targets.protein, targets.carbs, targets.fat, now, targets.userID]
    );

    return {
      ...targets,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Failed to update macro targets:', error);
    throw error;
  }
}

/**
 * Get or create daily log for a specific date
 */
export async function getOrCreateDailyLog(userID: string, date: string): Promise<DailyLog> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Get daily log
    const log = await db.getFirstAsync<Omit<DailyLog, 'breakfast' | 'lunch' | 'dinner' | 'snacks'>>(
      'SELECT * FROM daily_logs WHERE userID = ? AND date = ?',
      [userID, date]
    );

    let dailyLogID: string;
    let createdAt: string;

    if (!log) {
      // Create new log
      dailyLogID = uuidv4();
      const now = getCurrentTimestamp();
      createdAt = now;
      await db.runAsync(
        'INSERT INTO daily_logs (dailyLogID, userID, date, totalCalories, totalProtein, totalCarbs, totalFat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [dailyLogID, userID, date, 0, 0, 0, 0, now, now]
      );
    } else {
      dailyLogID = log.dailyLogID;
      createdAt = log.createdAt;
    }

    // Get all food entries for this log
    const entries = await db.getAllAsync<FoodEntry & { mealType: string }>(
      'SELECT * FROM food_entries WHERE dailyLogID = ? ORDER BY createdAt ASC',
      [dailyLogID]
    );

    // Group by meal type
    const breakfast: FoodEntry[] = [];
    const lunch: FoodEntry[] = [];
    const dinner: FoodEntry[] = [];
    const snacks: FoodEntry[] = [];

    for (const entry of entries) {
      const { mealType, ...foodEntry } = entry;
      switch (mealType) {
        case 'breakfast':
          breakfast.push(foodEntry);
          break;
        case 'lunch':
          lunch.push(foodEntry);
          break;
        case 'dinner':
          dinner.push(foodEntry);
          break;
        case 'snacks':
          snacks.push(foodEntry);
          break;
      }
    }

    // Calculate totals
    const totalCalories = entries.reduce((sum, e) => sum + e.calories, 0);
    const totalProtein = entries.reduce((sum, e) => sum + e.protein, 0);
    const totalCarbs = entries.reduce((sum, e) => sum + e.carbs, 0);
    const totalFat = entries.reduce((sum, e) => sum + e.fat, 0);

    // Update totals if they've changed
    if (log && (log.totalCalories !== totalCalories || log.totalProtein !== totalProtein ||
        log.totalCarbs !== totalCarbs || log.totalFat !== totalFat)) {
      await db.runAsync(
        'UPDATE daily_logs SET totalCalories = ?, totalProtein = ?, totalCarbs = ?, totalFat = ?, updatedAt = ? WHERE dailyLogID = ?',
        [totalCalories, totalProtein, totalCarbs, totalFat, getCurrentTimestamp(), dailyLogID]
      );
    }

    return {
      dailyLogID,
      userID,
      date,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      breakfast,
      lunch,
      dinner,
      snacks,
      createdAt,
      updatedAt: getCurrentTimestamp(),
    };
  } catch (error) {
    console.error('Failed to get or create daily log:', error);
    throw error;
  }
}

/**
 * Get calorie data for all dates in a specific month
 * Used for rendering calendar view with calorie rings
 */
export async function getMonthCalorieData(
  userID: string,
  year: number,
  month: number // 0-indexed (0 = January, 11 = December)
): Promise<DateCalorieData[]> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Get the date range for the month
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Get macro targets for the user to get calorie target
    const targets = await getOrCreateMacroTargets(userID);

    // Query all daily logs in the date range
    const logs = await db.getAllAsync<{ date: string; totalCalories: number }>(
      'SELECT date, totalCalories FROM daily_logs WHERE userID = ? AND date >= ? AND date <= ? ORDER BY date ASC',
      [userID, startDate, endDate]
    );

    // Map to DateCalorieData
    return logs.map(log => ({
      date: log.date,
      calories: log.totalCalories,
      calorieTarget: targets.calories,
    }));
  } catch (error) {
    console.error('Failed to get month calorie data:', error);
    throw error;
  }
}

/**
 * Add a food entry to a daily log
 */
export async function addFoodEntry(
  userID: string,
  dailyLogID: string,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snacks',
  food: Omit<FoodEntry, 'foodEntryID' | 'userID' | 'createdAt' | 'updatedAt'>
): Promise<FoodEntry> {
  if (!db) throw new Error('Database not initialized');

  try {
    const foodEntryID = uuidv4();
    const now = getCurrentTimestamp();

    await db.runAsync(
      'INSERT INTO food_entries (foodEntryID, userID, dailyLogID, mealType, name, quantity, calories, protein, carbs, fat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [foodEntryID, userID, dailyLogID, mealType, food.name, food.quantity, food.calories, food.protein, food.carbs, food.fat, now, now]
    );

    return {
      foodEntryID,
      userID,
      ...food,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Failed to add food entry:', error);
    throw error;
  }
}

/**
 * Replace all food entries for a daily log with new entries from LLM response
 * This deletes all existing entries and inserts the new complete state
 */
export async function replaceDailyFoodEntries(
  userID: string,
  dailyLogID: string,
  foodData: LLMResponse
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

    // Delete all existing entries for this daily log
    await db.runAsync('DELETE FROM food_entries WHERE dailyLogID = ?', [dailyLogID]);

    // Insert all new entries
    for (const mealType of mealTypes) {
      const items = foodData[mealType];
      for (const food of items) {
        const foodEntryID = uuidv4();
        await db.runAsync(
          'INSERT INTO food_entries (foodEntryID, userID, dailyLogID, mealType, name, quantity, calories, protein, carbs, fat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [foodEntryID, userID, dailyLogID, mealType, food.name, food.quantity, food.calories, food.protein, food.carbs, food.fat, now, now]
        );
      }
    }

    // Update daily log totals
    const allItems = [...foodData.breakfast, ...foodData.lunch, ...foodData.dinner, ...foodData.snacks];
    const totalCalories = allItems.reduce((sum, item) => sum + item.calories, 0);
    const totalProtein = allItems.reduce((sum, item) => sum + item.protein, 0);
    const totalCarbs = allItems.reduce((sum, item) => sum + item.carbs, 0);
    const totalFat = allItems.reduce((sum, item) => sum + item.fat, 0);

    await db.runAsync(
      'UPDATE daily_logs SET totalCalories = ?, totalProtein = ?, totalCarbs = ?, totalFat = ?, updatedAt = ? WHERE dailyLogID = ?',
      [totalCalories, totalProtein, totalCarbs, totalFat, now, dailyLogID]
    );
  } catch (error) {
    console.error('Failed to replace daily food entries:', error);
    throw error;
  }
}

/**
 * Delete a food entry
 */
export async function deleteFoodEntry(foodEntryID: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    await db.runAsync('DELETE FROM food_entries WHERE foodEntryID = ?', [foodEntryID]);
  } catch (error) {
    console.error('Failed to delete food entry:', error);
    throw error;
  }
}

/**
 * Clear all data (for testing)
 */
export async function clearAllData(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    await db.execAsync(`
      DELETE FROM food_entries;
      DELETE FROM daily_logs;
      DELETE FROM macro_targets;
      DELETE FROM users;
    `);
  } catch (error) {
    console.error('Failed to clear all data:', error);
    throw error;
  }
}
