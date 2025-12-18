import { Content, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { LLMResponse, FoodItem, DailyLog } from '../types';
import { foodParsingPrompt } from '../constants';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not found in environment variables');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

// Define the JSON schema for FoodItem
const foodItemSchema = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: 'Name of the food item',
    },
    quantity: {
      type: Type.STRING,
      description: 'Descriptive quantity (e.g., "3 large", "1 cup", "150g")',
    },
    calories: {
      type: Type.INTEGER,
      description: 'Total calories',
    },
    protein: {
      type: Type.INTEGER,
      description: 'Protein in grams',
    },
    carbs: {
      type: Type.INTEGER,
      description: 'Carbohydrates in grams',
    },
    fat: {
      type: Type.INTEGER,
      description: 'Fat in grams',
    },
  },
  required: ['name', 'quantity', 'calories', 'protein', 'carbs', 'fat'],
  propertyOrdering: ['name', 'quantity', 'calories', 'protein', 'carbs', 'fat'],
};

// Define the JSON schema for LLMResponse
const llmResponseSchema = {
  type: Type.OBJECT,
  properties: {
    breakfast: {
      type: Type.ARRAY,
      items: foodItemSchema,
      description: 'Food items for breakfast',
    },
    lunch: {
      type: Type.ARRAY,
      items: foodItemSchema,
      description: 'Food items for lunch',
    },
    dinner: {
      type: Type.ARRAY,
      items: foodItemSchema,
      description: 'Food items for dinner',
    },
    snacks: {
      type: Type.ARRAY,
      items: foodItemSchema,
      description: 'Food items for snacks',
    },
  },
  required: ['breakfast', 'lunch', 'dinner', 'snacks'],
  propertyOrdering: ['breakfast', 'lunch', 'dinner', 'snacks'],
};

interface ParseFoodInputParams {
  transcript: string;
  currentTime?: Date;
  previousDayLogs?: DailyLog[];
}

export async function parseFoodInput({
  transcript,
  currentTime = new Date(),
  previousDayLogs,
}: ParseFoodInputParams): Promise<LLMResponse> {
  try {
    const contents = buildContents(transcript, currentTime, previousDayLogs);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
        responseSchema: llmResponseSchema,
        tools: [{ googleSearch: {} }],
        thinkingConfig: {
          thinkingBudget: -1,
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.MEDIUM,
        },
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error('No response text from Gemini');
    }

    // Log Google Search usage if available
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries && groundingMetadata.webSearchQueries.length > 0) {
      console.log('🔍 Google Search queries used:', groundingMetadata.webSearchQueries);
      const searchChunks = groundingMetadata.groundingChunks;
      if (searchChunks && searchChunks.length > 0) {
        const urls = searchChunks.map(chunk => chunk.web?.uri).filter(Boolean);
        console.log('📚 Sources:', urls);
      }
    }

    const parsed = JSON.parse(text) as LLMResponse;

    return validateAndNormalizeLLMResponse(parsed);
  } catch (error) {
    console.error('Error parsing food input:', error);
    throw new Error(`Failed to parse food input: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function buildContents(
  transcript: string,
  currentTime: Date,
  previousDayLogs?: DailyLog[]
): Content[] {

  const systemPrompt = foodParsingPrompt;

  const userPrompt = `
  Transcript: ${transcript}
  Current Date/Time: ${currentTime.toISOString()}
  Previous Day Logs: ${previousDayLogs?.map(log => log.date).join(', ')}
  `;
  
  return [
    { role: 'system', parts: [{ text: systemPrompt }] },
    { role: 'user', parts: [{ text: userPrompt }] },
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
      normalized[mealType] = response[mealType].map((item: any) =>
        validateFoodItem(item)
      );
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
