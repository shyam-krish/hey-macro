import { Content, GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { LLMConfig, LLMProvider, LLMMessage, ReasoningEffort } from './llmTypes';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not found in environment variables');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

// Convert common message format to Gemini format
function convertMessages(messages: LLMMessage[]): Content[] {
  return messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }],
  }));
}

// Convert Zod schema to Gemini schema format
function zodToGeminiSchema(schema: z.ZodTypeAny): any {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToGeminiSchema(value as z.ZodTypeAny);
      // Check if the field is required (not optional)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: Type.OBJECT,
      properties,
      required,
      propertyOrdering: Object.keys(shape),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: Type.ARRAY,
      items: zodToGeminiSchema(schema.element as z.ZodTypeAny),
    };
  }

  if (schema instanceof z.ZodString) {
    return {
      type: Type.STRING,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodNumber) {
    return {
      type: Type.NUMBER,
      description: schema.description,
    };
  }

  if (schema instanceof z.ZodBoolean) {
    return {
      type: Type.BOOLEAN,
      description: schema.description,
    };
  }

  // Default fallback
  return { type: Type.STRING };
}

// Map reasoning effort to thinking budget
function getThinkingBudget(effort?: ReasoningEffort): number {
  switch (effort) {
    case 'low':
      return 256;
    case 'medium':
      return 512;
    case 'high':
      return 1024;
    default:
      return -1; // Auto
  }
}

export const geminiProvider: LLMProvider = {
  async generate<T extends z.ZodType>(config: LLMConfig<T>): Promise<z.infer<T>> {
    try {
      const contents = convertMessages(config.messages);
      const geminiSchema = zodToGeminiSchema(config.schema);

      // Note: Gemini doesn't support webSearch with JSON schema together
      // If webSearch is requested, we can't use responseSchema
      if (config.webSearch) {
        console.warn(
          'Gemini does not support web search with JSON schema. Web search will be disabled.'
        );
      }

      const response = await ai.models.generateContent({
        model: config.model,
        contents,
        config: {
          temperature: config.temperature ?? 0.3,
          maxOutputTokens: config.maxTokens ?? 2000,
          responseMimeType: 'application/json',
          responseSchema: geminiSchema,
          thinkingConfig: {
            thinkingBudget: getThinkingBudget(config.reasoning?.effort),
            includeThoughts: false,
          },
        },
      });

      const text = response.text;

      if (!text) {
        throw new Error('No response text from Gemini');
      }

      const parsed = JSON.parse(text);

      // Validate with Zod schema
      return config.schema.parse(parsed) as z.infer<T>;
    } catch (error) {
      console.error('Gemini API error:', error);
      throw new Error(
        `Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

// Default model for Gemini
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
