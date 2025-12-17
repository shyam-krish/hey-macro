/**
 * SQLite storage service for Hey Macro app
 * Handles all database operations with enhanced schema including user support
 */

import 'react-native-get-random-values'; // Must be imported before uuid
import * as SQLite from 'expo-sqlite';
import { v4 as uuidv4 } from 'uuid';
import type { User, MacroTargets, FoodEntry, FoodItem } from './types';

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
 * Initialize the database and create tables
 */
export async function initDatabase(): Promise<void> {
  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // Create users table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        userID TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Create targets table (single row per user)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        userID TEXT NOT NULL,
        calories INTEGER NOT NULL,
        protein INTEGER NOT NULL,
        carbs INTEGER NOT NULL,
        fat INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Create entries table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entries (
        foodEntryID TEXT PRIMARY KEY,
        userID TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity TEXT NOT NULL,
        calories REAL NOT NULL,
        protein REAL NOT NULL,
        carbs REAL NOT NULL,
        fat REAL NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Create index on entries for faster user queries
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_entries_user
      ON entries(userID);
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
 * Get macro targets for a user
 */
export async function getTargets(userID: string): Promise<MacroTargets | null> {
  if (!db) throw new Error('Database not initialized');

  try {
    const result = await db.getFirstAsync<MacroTargets>(
      'SELECT * FROM targets WHERE userID = ?',
      [userID]
    );

    return result || null;
  } catch (error) {
    console.error('Failed to get targets:', error);
    throw error;
  }
}

/**
 * Set macro targets for a user (upsert)
 */
export async function setTargets(
  userID: string,
  targets: Omit<MacroTargets, 'userID' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    const existing = await getTargets(userID);
    const now = getCurrentTimestamp();

    if (existing) {
      // Update existing targets
      await db.runAsync(
        `UPDATE targets
         SET calories = ?, protein = ?, carbs = ?, fat = ?, updatedAt = ?
         WHERE userID = ?`,
        [targets.calories, targets.protein, targets.carbs, targets.fat, now, userID]
      );
    } else {
      // Insert new targets
      await db.runAsync(
        `INSERT INTO targets (id, userID, calories, protein, carbs, fat, createdAt, updatedAt)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
        [userID, targets.calories, targets.protein, targets.carbs, targets.fat, now, now]
      );
    }
  } catch (error) {
    console.error('Failed to set targets:', error);
    throw error;
  }
}

/**
 * Get all food entries for a user
 */
export async function getEntries(userID: string): Promise<FoodEntry[]> {
  if (!db) throw new Error('Database not initialized');

  try {
    const rows = await db.getAllAsync<FoodEntry>(
      'SELECT * FROM entries WHERE userID = ? ORDER BY createdAt ASC',
      [userID]
    );

    return rows;
  } catch (error) {
    console.error('Failed to get entries:', error);
    throw error;
  }
}

/**
 * Add a new food entry
 */
export async function addEntry(
  entry: Omit<FoodEntry, 'foodEntryID' | 'createdAt' | 'updatedAt'>
): Promise<FoodEntry> {
  if (!db) throw new Error('Database not initialized');

  try {
    const foodEntryID = uuidv4();
    const now = getCurrentTimestamp();

    await db.runAsync(
      `INSERT INTO entries (foodEntryID, userID, name, quantity, calories, protein, carbs, fat, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        foodEntryID,
        entry.userID,
        entry.name,
        entry.quantity,
        entry.calories,
        entry.protein,
        entry.carbs,
        entry.fat,
        now,
        now,
      ]
    );

    return {
      foodEntryID,
      ...entry,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Failed to add entry:', error);
    throw error;
  }
}

/**
 * Update an existing food entry
 */
export async function updateEntry(entry: FoodEntry): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    const now = getCurrentTimestamp();

    await db.runAsync(
      `UPDATE entries
       SET name = ?, quantity = ?, calories = ?, protein = ?, carbs = ?, fat = ?, updatedAt = ?
       WHERE foodEntryID = ?`,
      [
        entry.name,
        entry.quantity,
        entry.calories,
        entry.protein,
        entry.carbs,
        entry.fat,
        now,
        entry.foodEntryID,
      ]
    );
  } catch (error) {
    console.error('Failed to update entry:', error);
    throw error;
  }
}

/**
 * Delete a food entry by ID
 */
export async function deleteEntry(foodEntryID: string): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  try {
    await db.runAsync('DELETE FROM entries WHERE foodEntryID = ?', [foodEntryID]);
  } catch (error) {
    console.error('Failed to delete entry:', error);
    throw error;
  }
}
