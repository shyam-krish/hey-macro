import { LLMResponse, FoodItem, DailyLog, MacroTargets } from '../types';
import { foodParsingPrompt, recommendationPrompt } from '../constants';
import { openaiProvider, OPENAI_DEFAULT_MODEL } from './openai';
import { geminiProvider, GEMINI_DEFAULT_MODEL, GEMINI3_DEFAULT_MODEL } from './gemini';
import { LLMMessage, LLMResponseSchema, LLMProvider, FoodItemParsed, LLMResponseParsed, RecommendationResponseSchema } from './llmTypes';

// Provider selection - gemini3 is the recommended default (supports web search + structured output)
type ProviderType = 'openai' | 'gemini' | 'gemini3';

// Default to Gemini 3 Flash - best price/performance with web search + structured output
const DEFAULT_PROVIDER: ProviderType = 'gemini3';

function getProvider(providerType: ProviderType): LLMProvider {
  switch (providerType) {
    case 'openai':
      return openaiProvider;
    case 'gemini':
    case 'gemini3':
      return geminiProvider; // Same provider, different model
    default:
      return geminiProvider;
  }
}

function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case 'openai':
      return OPENAI_DEFAULT_MODEL;
    case 'gemini':
      return GEMINI_DEFAULT_MODEL;
    case 'gemini3':
      return GEMINI3_DEFAULT_MODEL;
    default:
      return GEMINI3_DEFAULT_MODEL;
  }
}

interface ParseFoodInputParams {
  transcript: string;
  currentTime?: Date;
  todayLog?: DailyLog;
  previousDayLogs?: DailyLog[];
  provider?: ProviderType;
  model?: string;
  enableWebSearch?: boolean; // Enable Google Search grounding (default: true for Gemini 3)
}

export async function parseFoodInput({
  transcript,
  currentTime = new Date(),
  todayLog,
  previousDayLogs,
  provider = DEFAULT_PROVIDER,
  model,
  enableWebSearch = true,
}: ParseFoodInputParams): Promise<LLMResponse> {
  try {
    const llmProvider = getProvider(provider);
    const modelToUse = model || getDefaultModel(provider);
    const messages = buildMessages(transcript, currentTime, todayLog, previousDayLogs);

    // Determine if web search should be enabled
    // Gemini 3 supports web search + structured output together
    const isGemini3 = modelToUse.includes('gemini-3');
    const useWebSearch = enableWebSearch && isGemini3;

    const result = await llmProvider.generate({
      model: modelToUse,
      messages,
      schema: LLMResponseSchema,
      schemaName: 'food_log_response',
      webSearch: useWebSearch,
      reasoning: {
        effort: 'low', // Low thinking for speed, web search provides accuracy
      },
      temperature: 0.3,
      // maxTokens: omit to use model default (8192 for Gemini 2.0, 65536 for Gemini 2.5)
    });

    return validateAndNormalizeLLMResponse(result);
  } catch (error) {
    throw new Error(
      `Failed to parse food input: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function formatFoodItem(f: { name: string; quantity: string; calories: number; protein: number; carbs: number; fat: number }): string {
  return `${f.name} (${f.quantity}) [${f.calories} cal, ${f.protein}g P, ${f.carbs}g C, ${f.fat}g F]`;
}

function formatMealsFromLog(log: DailyLog): string[] {
  const meals: string[] = [];
  if (log.breakfast.length > 0) {
    meals.push(`Breakfast: ${log.breakfast.map(formatFoodItem).join(', ')}`);
  }
  if (log.lunch.length > 0) {
    meals.push(`Lunch: ${log.lunch.map(formatFoodItem).join(', ')}`);
  }
  if (log.dinner.length > 0) {
    meals.push(`Dinner: ${log.dinner.map(formatFoodItem).join(', ')}`);
  }
  if (log.snacks.length > 0) {
    meals.push(`Snacks: ${log.snacks.map(formatFoodItem).join(', ')}`);
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

function validateAndNormalizeLLMResponse(response: LLMResponseParsed): LLMResponse {
  const normalized: LLMResponse = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };

  const mealTypes: Array<keyof LLMResponse> = ['breakfast', 'lunch', 'dinner', 'snacks'];

  for (const mealType of mealTypes) {
    if (Array.isArray(response[mealType])) {
      normalized[mealType] = response[mealType].map((item: FoodItemParsed) => validateFoodItem(item));
    }
  }

  return normalized;
}

interface GetRecommendationParams {
  question: string;
  currentTime?: Date;
  todayLog: DailyLog;
  macroTargets: MacroTargets;
  provider?: ProviderType;
  enableWebSearch?: boolean;
}

export async function getRecommendation({
  question,
  currentTime = new Date(),
  todayLog,
  macroTargets,
  provider = DEFAULT_PROVIDER,
  enableWebSearch = true,
}: GetRecommendationParams): Promise<{ isValid: boolean; answer: string }> {
  try {
    const llmProvider = getProvider(provider);
    const modelToUse = getDefaultModel(provider);
    const isGemini3 = modelToUse.includes('gemini-3');
    const useWebSearch = enableWebSearch && isGemini3;

    const remaining = {
      calories: macroTargets.calories - todayLog.totalCalories,
      protein: macroTargets.protein - todayLog.totalProtein,
      carbs: macroTargets.carbs - todayLog.totalCarbs,
      fat: macroTargets.fat - todayLog.totalFat,
    };

    const mealsContext = formatMealsFromLog(todayLog);

    const userPrompt = `Current Date/Time: ${currentTime.toISOString()}

Macro Targets: Calories: ${macroTargets.calories}, Protein: ${macroTargets.protein}g, Carbs: ${macroTargets.carbs}g, Fat: ${macroTargets.fat}g

Consumed Today: Calories: ${todayLog.totalCalories}, Protein: ${todayLog.totalProtein}g, Carbs: ${todayLog.totalCarbs}g, Fat: ${todayLog.totalFat}g

Remaining: Calories: ${remaining.calories}, Protein: ${remaining.protein}g, Carbs: ${remaining.carbs}g, Fat: ${remaining.fat}g

Today's meals:
${mealsContext.length > 0 ? mealsContext.join('\n') : 'Nothing logged yet'}

Question: ${question}`;

    const result = await llmProvider.generate({
      model: modelToUse,
      messages: [
        { role: 'system', content: recommendationPrompt },
        { role: 'user', content: userPrompt },
      ],
      schema: RecommendationResponseSchema,
      schemaName: 'recommendation_response',
      webSearch: useWebSearch,
      reasoning: { effort: 'low' },
      temperature: 0.5,
    });

    return { isValid: result.isValid, answer: result.answer };
  } catch (error) {
    throw new Error(
      `Failed to get recommendation: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Validate and normalize food item for storage
function validateFoodItem(item: FoodItemParsed): FoodItem {
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
