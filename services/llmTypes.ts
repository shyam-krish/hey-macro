import { z } from 'zod';

// Common message format for all LLM providers
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Reasoning effort levels
export type ReasoningEffort = 'low' | 'medium' | 'high';

// Common configuration for LLM calls
export interface LLMConfig<T extends z.ZodType> {
  model: string;
  messages: LLMMessage[];
  schema: T;
  schemaName: string;
  webSearch?: boolean;
  reasoning?: {
    effort: ReasoningEffort;
  };
  temperature?: number;
  maxTokens?: number;
}

// Zod schemas for food parsing
export const FoodItemSchema = z.object({
  name: z.string().describe('Name of the food item'),
  quantity: z.string().describe('Descriptive quantity (e.g., "3 large", "1 cup", "150g")'),
  calories: z.number().describe('Total calories in kcal'),
  protein: z.number().describe('Protein in grams'),
  carbs: z.number().describe('Carbohydrates in grams'),
  fat: z.number().describe('Fat in grams'),
});

export const LLMResponseSchema = z.object({
  breakfast: z.array(FoodItemSchema).describe('Food items for breakfast'),
  lunch: z.array(FoodItemSchema).describe('Food items for lunch'),
  dinner: z.array(FoodItemSchema).describe('Food items for dinner'),
  snacks: z.array(FoodItemSchema).describe('Food items for snacks'),
});

// Infer types from schemas
export type FoodItemParsed = z.infer<typeof FoodItemSchema>;
export type LLMResponseParsed = z.infer<typeof LLMResponseSchema>;

// Provider interface
export interface LLMProvider {
  generate<T extends z.ZodType>(config: LLMConfig<T>): Promise<z.infer<T>>;
}
