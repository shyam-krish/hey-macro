import { Content, GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import { LLMConfig, LLMProvider, LLMMessage, ReasoningEffort } from './llmTypes';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Request timeout in milliseconds (2 minutes)
// Gemini 3 with web search can take a while, especially on slow networks
const REQUEST_TIMEOUT_MS = 120000;

// if (!GEMINI_API_KEY) {
//   console.warn('GEMINI_API_KEY not found in environment variables');
// }

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY || '',
  httpOptions: {
    timeout: REQUEST_TIMEOUT_MS,
  },
});

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
    // Check API key before making request
    if (!GEMINI_API_KEY || GEMINI_API_KEY === '') {
      throw new Error('GEMINI_API_KEY is not configured. Please check your .env file and restart Expo.');
    }

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
        // maxOutputTokens: omit to use model default (8192 for 2.0, 65536 for 2.5+)
        ...(config.maxTokens && { maxOutputTokens: config.maxTokens }),
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

      console.log('[Gemini] Making API request to model:', config.model);

      const response = await ai.models.generateContent({
        model: config.model,
        contents,
        config: generateConfig,
      });

      // Log response structure for debugging
      console.log('[Gemini] Response candidates:', response.candidates?.length);
      console.log('[Gemini] First candidate finish reason:', response.candidates?.[0]?.finishReason);

      // Check for blocked or incomplete responses
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`[Gemini] Unexpected finish reason: ${finishReason}`);

        if (finishReason === 'MAX_TOKENS') {
          throw new Error(`MAX_TOKENS: Response truncated at ${generateConfig.maxOutputTokens} tokens. Increase maxOutputTokens.`);
        } else if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
          throw new Error(`${finishReason}: Response blocked by Gemini safety filters`);
        } else {
          throw new Error(`INCOMPLETE: finishReason=${finishReason}, candidates=${response.candidates?.length}`);
        }
      }

      const text = response.text;

      if (!text) {
        throw new Error('No response text from Gemini');
      }

      console.log('[Gemini] Response text length:', text.length);

      // Log grounding metadata if available (Gemini 3 with search)
      const metadata = response.candidates?.[0]?.groundingMetadata;
      if (metadata) {
        console.log('[Gemini 3] Search queries used:', metadata.webSearchQueries);
        const sources = metadata.groundingChunks?.map((chunk: any) => chunk.web?.title).filter(Boolean) || [];
        if (sources.length > 0) {
          console.log('[Gemini 3] Sources:', sources);
        }
      }

      // Parse JSON with better error handling
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (parseError) {
        console.error('[Gemini] Failed to parse JSON response');
        console.error('[Gemini] Parse error:', parseError);
        console.error('[Gemini] Response text:', text.substring(0, 500)); // Log first 500 chars

        const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
        const preview = text.substring(0, 100) + (text.length > 100 ? '...' : '');
        throw new Error(
          `JSON Parse error: ${errorMsg} | finishReason=${finishReason || 'none'} | length=${text.length} | preview="${preview}"`
        );
      }

      // Validate with Zod schema
      return config.schema.parse(parsed) as z.infer<T>;
    } catch (error) {
      console.error('[Gemini] Full error details:', error);

      // Better error messages for common issues
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          throw new Error('TIMEOUT_ERROR');
        }

        if (errorMsg.includes('network request failed')) {
          // Network request failed is often a timeout in disguise
          throw new Error('TIMEOUT_ERROR');
        }

        if (errorMsg.includes('api key') || errorMsg.includes('unauthorized') || errorMsg.includes('403')) {
          throw new Error(
            'Invalid API key: Please verify your GEMINI_API_KEY is valid.'
          );
        }

        throw new Error(`Gemini API error: ${error.message}`);
      }

      throw new Error(`Gemini API error: ${JSON.stringify(error)}`);
    }
  },
};

// Default models
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
export const GEMINI3_DEFAULT_MODEL = 'gemini-3-flash-preview';
