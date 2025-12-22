import { LLMResponse, FoodItem, DailyLog } from '../types';
import { foodParsingPrompt } from '../constants';
import { openaiProvider, OPENAI_DEFAULT_MODEL } from './openai';
import { geminiProvider, GEMINI_DEFAULT_MODEL } from './gemini';
import { LLMMessage, LLMResponseSchema, LLMProvider } from './llmTypes';

// Provider selection
type ProviderType = 'openai' | 'gemini';

const DEFAULT_PROVIDER: ProviderType = 'openai';

function getProvider(providerType: ProviderType): LLMProvider {
  switch (providerType) {
    case 'openai':
      return openaiProvider;
    case 'gemini':
      return geminiProvider;
    default:
      return openaiProvider;
  }
}

function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case 'openai':
      return OPENAI_DEFAULT_MODEL;
    case 'gemini':
      return GEMINI_DEFAULT_MODEL;
    default:
      return OPENAI_DEFAULT_MODEL;
  }
}

interface ParseFoodInputParams {
  transcript: string;
  currentTime?: Date;
  todayLog?: DailyLog;
  previousDayLogs?: DailyLog[];
  provider?: ProviderType;
  model?: string;
}

export async function parseFoodInput({
  transcript,
  currentTime = new Date(),
  todayLog,
  previousDayLogs,
  provider = DEFAULT_PROVIDER,
  model,
}: ParseFoodInputParams): Promise<LLMResponse> {
  try {
    const llmProvider = getProvider(provider);
    const modelToUse = model || getDefaultModel(provider);
    const messages = buildMessages(transcript, currentTime, todayLog, previousDayLogs);

    const result = await llmProvider.generate({
      model: modelToUse,
      messages,
      schema: LLMResponseSchema,
      schemaName: 'food_log_response',
      webSearch: provider === 'openai', // Only enable web search for OpenAI (Gemini doesn't support it with JSON schema)
      reasoning: {
        effort: 'low',
      },
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Validate and normalize the response
    return validateAndNormalizeLLMResponse(result);
  } catch (error) {
    console.error('Error parsing food input:', error);
    throw new Error(
      `Failed to parse food input: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function formatMealsFromLog(log: DailyLog): string[] {
  const meals: string[] = [];
  if (log.breakfast.length > 0) {
    meals.push(`Breakfast: ${log.breakfast.map((f) => `${f.name} (${f.quantity})`).join(', ')}`);
  }
  if (log.lunch.length > 0) {
    meals.push(`Lunch: ${log.lunch.map((f) => `${f.name} (${f.quantity})`).join(', ')}`);
  }
  if (log.dinner.length > 0) {
    meals.push(`Dinner: ${log.dinner.map((f) => `${f.name} (${f.quantity})`).join(', ')}`);
  }
  if (log.snacks.length > 0) {
    meals.push(`Snacks: ${log.snacks.map((f) => `${f.name} (${f.quantity})`).join(', ')}`);
  }
  return meals;
}

function buildMessages(
  transcript: string,
  currentTime: Date,
  todayLog?: DailyLog,
  previousDayLogs?: DailyLog[]
): LLMMessage[] {
  const systemPrompt = foodParsingPrompt;

  let previousMealsContext = '';
  if (previousDayLogs && previousDayLogs.length > 0) {
    previousMealsContext = previousDayLogs
      .map((log) => {
        const meals = formatMealsFromLog(log);
        return `${log.date}:\n${meals.join('\n')}`;
      })
      .join('\n\n');
  }

  let todayFoodContext = 'Empty';
  if (todayLog) {
    const meals = formatMealsFromLog(todayLog);
    if (meals.length > 0) {
      todayFoodContext = meals.join('\n');
    }
  }

  const userPrompt = `Current Date/Time: ${currentTime.toISOString()}

${previousMealsContext ? `Previous meals for reference:\n${previousMealsContext}\n\n` : ''}Today's food so far:
${todayFoodContext}

Transcript: ${transcript}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function validateAndNormalizeLLMResponse(response: any): LLMResponse {
  const normalized: LLMResponse = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };

  const mealTypes: Array<keyof LLMResponse> = ['breakfast', 'lunch', 'dinner', 'snacks'];

  for (const mealType of mealTypes) {
    if (Array.isArray(response[mealType])) {
      normalized[mealType] = response[mealType].map((item: any) => validateFoodItem(item));
    }
  }

  return normalized;
}

function validateFoodItem(item: any): FoodItem {
  if (!item.name || typeof item.name !== 'string') {
    throw new Error('Food item must have a name');
  }

  return {
    name: item.name,
    quantity: item.quantity || '1 serving',
    calories: Math.round(Number(item.calories) || 0),
    protein: Math.round(Number(item.protein) || 0),
    carbs: Math.round(Number(item.carbs) || 0),
    fat: Math.round(Number(item.fat) || 0),
  };
}
