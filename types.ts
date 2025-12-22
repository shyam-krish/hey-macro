/**
 * Macro tracking types for Hey Macro app
 */

export interface BaseEntity {
  createdAt: string;
  updatedAt: string;
}

export interface User extends BaseEntity {
  userID: string;
  firstName: string;
  lastName: string;
}

export interface MacroTargets extends BaseEntity {
  userID: string;
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
}

export interface FoodEntry extends BaseEntity, FoodItem {
  foodEntryID: string;
  userID: string;
}
export interface DailyLog extends BaseEntity {
  dailyLogID: string;
  userID: string;
  date: string; // YYYY-MM-DD
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  breakfast: FoodEntry[];
  lunch: FoodEntry[];
  dinner: FoodEntry[];
  snacks: FoodEntry[];
}

export interface FoodItem {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}


export interface LLMResponse {
  breakfast: FoodItem[];
  lunch: FoodItem[];
  dinner: FoodItem[];
  snacks: FoodItem[];
}

export interface DateCalorieData {
  date: string; // YYYY-MM-DD
  calories: number;
  calorieTarget: number;
}
