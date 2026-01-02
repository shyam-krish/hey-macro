import { Content, GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { LLMConfig, LLMProvider, LLMMessage, ReasoningEffort } from './llmTypes';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// if (!GEMINI_API_KEY) {
//   console.warn('GEMINI_API_KEY not found in environment variables');
// }

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

// Check if model is Gemini 3 (supports web search + structured output together)
function isGemini3Model(model: string): boolean {
  return model.includes('gemini-3');
}

// Map reasoning effort to thinking budget (for Gemini 2.x)
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

// Map reasoning effort to thinking level (for Gemini 3.x)
function getThinkingLevel(effort?: ReasoningEffort): string {
  switch (effort) {
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    default:
      return 'low'; // Default to low for food parsing
  }
}

export const geminiProvider: LLMProvider = {
  async generate<T extends z.ZodType>(config: LLMConfig<T>): Promise<z.infer<T>> {
    try {
      const contents = convertMessages(config.messages);
      const geminiSchema = zodToGeminiSchema(config.schema);
      const isGemini3 = isGemini3Model(config.model);

      // Gemini 3 supports web search + structured output together!
      // Gemini 2.x does not - web search would be disabled
      if (config.webSearch && !isGemini3) {
        console.warn(
          'Gemini 2.x does not support web search with JSON schema. Upgrade to Gemini 3 for this feature.'
        );
      }

      // Build config based on model version
      const generateConfig: any = {
        temperature: config.temperature ?? 0.3,
        maxOutputTokens: config.maxTokens ?? 2000,
        responseMimeType: 'application/json',
        responseSchema: geminiSchema,
      };

      // Add tools for Gemini 3 with web search
      if (isGemini3 && config.webSearch) {
        generateConfig.tools = [{ googleSearch: {} }];
        // Gemini 3 uses thinkingLevel instead of thinkingBudget
        generateConfig.thinkingLevel = getThinkingLevel(config.reasoning?.effort);
        console.log('[Gemini 3] Using Google Search grounding with structured output');
      } else {
        // Gemini 2.x uses thinkingBudget
        generateConfig.thinkingConfig = {
          thinkingBudget: getThinkingBudget(config.reasoning?.effort),
          includeThoughts: false,
        };
      }

      const response = await ai.models.generateContent({
        model: config.model,
        contents,
        config: generateConfig,
      });

      const text = response.text;

      if (!text) {
        throw new Error('No response text from Gemini');
      }

      // Log grounding metadata if available (Gemini 3 with search)
      const metadata = response.candidates?.[0]?.groundingMetadata;
      if (metadata) {
        console.log('[Gemini 3] Search queries used:', metadata.webSearchQueries);
        const sources = metadata.groundingChunks?.map((chunk: any) => chunk.web?.title).filter(Boolean) || [];
        if (sources.length > 0) {
          console.log('[Gemini 3] Sources:', sources);
        }
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

// Default models
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
export const GEMINI3_DEFAULT_MODEL = 'gemini-3-flash-preview';
