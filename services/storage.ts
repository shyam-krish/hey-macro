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
const DEFAULT_USER_FIRST_NAME = 'Default';
const DEFAULT_USER_LAST_NAME = 'Name';

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Helper: Get current timestamp as ISO string
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Helper: Format a date as YYYY-MM-DD in local timezone
 */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Helper: Get today's date as YYYY-MM-DD
 */
function getTodayDate(): string {
  return formatLocalDate(new Date());
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

    // Run migrations
    await runMigrations();
  } catch (error) {
    throw error;
  }
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Check if target columns exist in daily_logs
    const tableInfo = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(daily_logs)'
    );
    const columnNames = tableInfo.map((col) => col.name);

    if (!columnNames.includes('targetCalories')) {
      await db.execAsync(`
        ALTER TABLE daily_logs ADD COLUMN targetCalories INTEGER DEFAULT 2690;
        ALTER TABLE daily_logs ADD COLUMN targetProtein INTEGER DEFAULT 170;
        ALTER TABLE daily_logs ADD COLUMN targetCarbs INTEGER DEFAULT 300;
        ALTER TABLE daily_logs ADD COLUMN targetFat INTEGER DEFAULT 90;
      `);
    }
  } catch (error) {
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
    throw error;
  }
}

/**
 * Update user information
 */
export async function updateUser(
  user: Omit<User, 'createdAt' | 'updatedAt'>
): Promise<User> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();

    const existing = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE userID = ?',
      [user.userID]
    );

    await db.runAsync(
      'UPDATE users SET firstName = ?, lastName = ?, updatedAt = ? WHERE userID = ?',
      [user.firstName, user.lastName, now, user.userID]
    );

    return {
      ...user,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  } catch (error) {
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
      calories: 2690,
      protein: 170,
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
    throw error;
  }
}

/**
 * Update macro targets
 * Also updates today's daily log targets so changes reflect immediately
 */
export async function updateMacroTargets(
  targets: Omit<MacroTargets, 'createdAt' | 'updatedAt'>
): Promise<MacroTargets> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();
    const today = getTodayDate();

    const existing = await db.getFirstAsync<MacroTargets>(
      'SELECT * FROM macro_targets WHERE userID = ?',
      [targets.userID]
    );

    // Update global macro targets
    await db.runAsync(
      'UPDATE macro_targets SET calories = ?, protein = ?, carbs = ?, fat = ?, updatedAt = ? WHERE userID = ?',
      [targets.calories, targets.protein, targets.carbs, targets.fat, now, targets.userID]
    );

    // Also update today's daily log targets (if it exists)
    await db.runAsync(
      'UPDATE daily_logs SET targetCalories = ?, targetProtein = ?, targetCarbs = ?, targetFat = ?, updatedAt = ? WHERE userID = ? AND date = ?',
      [targets.calories, targets.protein, targets.carbs, targets.fat, now, targets.userID, today]
    );

    return {
      ...targets,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
  } catch (error) {
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
    let targetCalories: number;
    let targetProtein: number;
    let targetCarbs: number;
    let targetFat: number;

    if (!log) {
      // Create new log with current macro targets
      dailyLogID = uuidv4();
      const now = getCurrentTimestamp();
      createdAt = now;

      // Get current targets to snapshot for this day
      const targets = await getOrCreateMacroTargets(userID);
      targetCalories = targets.calories;
      targetProtein = targets.protein;
      targetCarbs = targets.carbs;
      targetFat = targets.fat;

      await db.runAsync(
        'INSERT INTO daily_logs (dailyLogID, userID, date, totalCalories, totalProtein, totalCarbs, totalFat, targetCalories, targetProtein, targetCarbs, targetFat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [dailyLogID, userID, date, 0, 0, 0, 0, targetCalories, targetProtein, targetCarbs, targetFat, now, now]
      );
    } else {
      dailyLogID = log.dailyLogID;
      createdAt = log.createdAt;
      targetCalories = log.targetCalories;
      targetProtein = log.targetProtein;
      targetCarbs = log.targetCarbs;
      targetFat = log.targetFat;
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
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFat,
      breakfast,
      lunch,
      dinner,
      snacks,
      createdAt,
      updatedAt: getCurrentTimestamp(),
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get calorie data for all dates in a specific month
 * Used for rendering calendar view with calorie rings
 * Uses per-day targets stored in daily_logs
 */
export async function getMonthCalorieData(
  userID: string,
  year: number,
  month: number // 0-indexed (0 = January, 11 = December)
): Promise<DateCalorieData[]> {
  if (!db) throw new Error('Database not initialized');

  try {
    // Get the date range for the month
    const startDate = formatLocalDate(new Date(year, month, 1));
    const endDate = formatLocalDate(new Date(year, month + 1, 0));

    // Query all daily logs in the date range with their per-day targets
    const logs = await db.getAllAsync<{ date: string; totalCalories: number; targetCalories: number }>(
      'SELECT date, totalCalories, targetCalories FROM daily_logs WHERE userID = ? AND date >= ? AND date <= ? ORDER BY date ASC',
      [userID, startDate, endDate]
    );

    // Map to DateCalorieData using per-day targets
    return logs.map(log => ({
      date: log.date,
      calories: log.totalCalories,
      calorieTarget: log.targetCalories,
    }));
  } catch (error) {
    throw error;
  }
}

/**
 * Get the earliest date with data for a user
 * Returns null if no data exists
 */
export async function getEarliestLogDate(userID: string): Promise<string | null> {
  if (!db) throw new Error('Database not initialized');

  try {
    const result = await db.getFirstAsync<{ date: string }>(
      'SELECT MIN(date) as date FROM daily_logs WHERE userID = ?',
      [userID]
    );
    return result?.date || null;
  } catch (error) {
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
    throw error;
  }
}

/**
 * Replace all food entries for a daily log with new entries from LLM response
 * This deletes all existing entries and inserts the new complete state
 * Uses a transaction for better performance (single disk sync)
 */
export async function replaceDailyFoodEntries(
  userID: string,
  dailyLogID: string,
  foodData: LLMResponse
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    const database = db; // Capture for use in transaction callback
    const now = getCurrentTimestamp();
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

    // Calculate totals upfront
    const allItems = [...foodData.breakfast, ...foodData.lunch, ...foodData.dinner, ...foodData.snacks];
    const totalCalories = allItems.reduce((sum, item) => sum + item.calories, 0);
    const totalProtein = allItems.reduce((sum, item) => sum + item.protein, 0);
    const totalCarbs = allItems.reduce((sum, item) => sum + item.carbs, 0);
    const totalFat = allItems.reduce((sum, item) => sum + item.fat, 0);

    // Use transaction to batch all operations (single disk sync)
    await database.withTransactionAsync(async () => {
      // Delete all existing entries for this daily log
      await database.runAsync('DELETE FROM food_entries WHERE dailyLogID = ?', [dailyLogID]);

      // Insert all new entries
      for (const mealType of mealTypes) {
        const items = foodData[mealType];
        for (const food of items) {
          const foodEntryID = uuidv4();
          await database.runAsync(
            'INSERT INTO food_entries (foodEntryID, userID, dailyLogID, mealType, name, quantity, calories, protein, carbs, fat, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [foodEntryID, userID, dailyLogID, mealType, food.name, food.quantity, food.calories, food.protein, food.carbs, food.fat, now, now]
          );
        }
      }

      // Update daily log totals
      await database.runAsync(
        'UPDATE daily_logs SET totalCalories = ?, totalProtein = ?, totalCarbs = ?, totalFat = ?, updatedAt = ? WHERE dailyLogID = ?',
        [totalCalories, totalProtein, totalCarbs, totalFat, now, dailyLogID]
      );
    });
  } catch (error) {
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
    throw error;
  }
}

/**
 * Update a food entry
 */
export async function updateFoodEntry(
  foodEntryID: string,
  updates: {
    name?: string;
    quantity?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  }
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();

    // Build dynamic update query based on provided fields
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.quantity !== undefined) {
      fields.push('quantity = ?');
      values.push(updates.quantity);
    }
    if (updates.calories !== undefined) {
      fields.push('calories = ?');
      values.push(updates.calories);
    }
    if (updates.protein !== undefined) {
      fields.push('protein = ?');
      values.push(updates.protein);
    }
    if (updates.carbs !== undefined) {
      fields.push('carbs = ?');
      values.push(updates.carbs);
    }
    if (updates.fat !== undefined) {
      fields.push('fat = ?');
      values.push(updates.fat);
    }

    if (fields.length === 0) return;

    fields.push('updatedAt = ?');
    values.push(now);
    values.push(foodEntryID);

    await db.runAsync(
      `UPDATE food_entries SET ${fields.join(', ')} WHERE foodEntryID = ?`,
      values
    );
  } catch (error) {
    throw error;
  }
}

/**
 * Get the last N days of logs (excluding today), filtering out empty days
 * Returns logs sorted by date descending (most recent first)
 */
export async function getPreviousDaysLogs(
  userID: string,
  days: number = 7
): Promise<DailyLog[]> {
  if (!db) throw new Error('Database not initialized');

  try {
    const today = getTodayDate();

    // Get logs from the last N days that have food entries
    const logs = await db.getAllAsync<{ dailyLogID: string; date: string }>(
      `SELECT DISTINCT dl.dailyLogID, dl.date
       FROM daily_logs dl
       INNER JOIN food_entries fe ON fe.dailyLogID = dl.dailyLogID
       WHERE dl.userID = ? AND dl.date < ?
       ORDER BY dl.date DESC
       LIMIT ?`,
      [userID, today, days]
    );

    // Fetch full log data for each
    const fullLogs: DailyLog[] = [];
    for (const log of logs) {
      const fullLog = await getOrCreateDailyLog(userID, log.date);
      fullLogs.push(fullLog);
    }

    return fullLogs;
  } catch (error) {
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
    throw error;
  }
}
