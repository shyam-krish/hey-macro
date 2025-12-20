import OpenAI from 'openai';
import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { LLMConfig, LLMProvider, LLMMessage } from './llmTypes';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn('OPENAI_API_KEY not found in environment variables');
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY || '' });

// Convert common message format to OpenAI format
function convertMessages(messages: LLMMessage[]): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

export const openaiProvider: LLMProvider = {
  async generate<T extends z.ZodType>(config: LLMConfig<T>): Promise<z.infer<T>> {
    try {
      const tools: Array<{ type: 'web_search' }> = [];
      if (config.webSearch) {
        tools.push({ type: 'web_search' });
      }

      const response = await client.responses.parse({
        model: config.model,
        input: convertMessages(config.messages),
        ...(tools.length > 0 && { tools }),
        ...(config.reasoning && {
          reasoning: {
            effort: config.reasoning.effort,
          },
        }),
        text: {
          format: zodTextFormat(config.schema, config.schemaName),
        },
      });

      // The parsed response is available on output_parsed
      if (!response.output_parsed) {
        throw new Error('No parsed output from OpenAI');
      }

      return response.output_parsed as z.infer<T>;
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(
        `OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

// Default model for OpenAI
export const OPENAI_DEFAULT_MODEL = 'gpt-5.2';
