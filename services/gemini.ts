import { Content, GoogleGenAI, Schema, Type } from '@google/genai';
import { z } from 'zod';
import { LLMConfig, LLMProvider, LLMMessage, ReasoningEffort } from './llmTypes';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Request timeout in milliseconds (5 minutes)
// Gemini 3 with web search can take a while, especially on slow networks
const REQUEST_TIMEOUT_MS = 300000;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000; // Start with 2 seconds

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
function zodToGeminiSchema(schema: z.ZodTypeAny): Schema {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, Schema> = {};
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

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if error is retryable (network/timeout errors)
function isRetryableError(error: Error): boolean {
  const errorMsg = error.message.toLowerCase();
  return (
    errorMsg.includes('timeout') ||
    errorMsg.includes('timed out') ||
    errorMsg.includes('network request failed') ||
    errorMsg.includes('econnreset') ||
    errorMsg.includes('enotfound') ||
    errorMsg.includes('econnrefused')
  );
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

    let lastError: Error | null = null;

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const contents = convertMessages(config.messages);
        const geminiSchema = zodToGeminiSchema(config.schema);
        const isGemini3 = isGemini3Model(config.model);

        // Build config based on model version
        const generateConfig: Record<string, unknown> = {
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
          generateConfig.thinkingConfig = {
            thinkingLevel: getThinkingLevel(config.reasoning?.effort),
          };
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

        // Check for blocked or incomplete responses
        const finishReason = response.candidates?.[0]?.finishReason;
        if (finishReason && finishReason !== 'STOP') {
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

        // Parse JSON with better error handling
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (parseError) {
          const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
          const preview = text.substring(0, 100) + (text.length > 100 ? '...' : '');
          throw new Error(
            `JSON Parse error: ${errorMsg} | finishReason=${finishReason || 'none'} | length=${text.length} | preview="${preview}"`
          );
        }

        // Validate with Zod schema
        const validated = config.schema.parse(parsed) as z.infer<T>;

        return validated;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a retryable error
        if (attempt < MAX_RETRIES && isRetryableError(lastError)) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt); // Exponential backoff
          await sleep(delayMs);
          continue; // Retry
        }

        // Non-retryable error or max retries reached - throw with raw error message
        break;
      }
    }

    if (lastError) {
      // Pass through the raw error message for debugging
      if (lastError.message.includes('api key') || lastError.message.toLowerCase().includes('unauthorized') || lastError.message.includes('403')) {
        throw new Error('Invalid API key: Please verify your GEMINI_API_KEY is valid.');
      }

      // Return raw error message for all other errors
      throw new Error(`Gemini API error: ${lastError.message}`);
    }

    throw new Error('Gemini API error: Unknown error');
  },
};

// Default models
export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';
export const GEMINI3_DEFAULT_MODEL = 'gemini-3-flash-preview';
