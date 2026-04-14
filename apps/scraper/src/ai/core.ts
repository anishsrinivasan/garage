import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, type LanguageModel, type ModelMessage } from "ai";
import type { ZodType } from "zod";

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY,
});
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";
const DEFAULT_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 5);

function resolveModel(modelId: string): LanguageModel {
  const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();
  const provider = explicitProvider ?? inferProvider(modelId);
  switch (provider) {
    case "google":
      return google(modelId);
    case "anthropic":
      return anthropic(modelId);
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

function inferProvider(modelId: string): string {
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  throw new Error(
    `Cannot infer provider for model "${modelId}". Set LLM_PROVIDER=google|anthropic explicitly.`,
  );
}

export type StructuredOptions<T> = {
  schema: ZodType<T>;
  schemaName?: string;
  system?: string;
  messages: ModelMessage[];
  model?: string;
  maxRetries?: number;
  temperature?: number;
  maxOutputTokens?: number;
};

export async function generateStructured<T>(
  options: StructuredOptions<T>,
): Promise<T> {
  const modelId = options.model ?? DEFAULT_MODEL;
  const { object } = await generateObject({
    model: resolveModel(modelId),
    schema: options.schema,
    schemaName: options.schemaName,
    system: options.system,
    messages: options.messages,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    temperature: options.temperature ?? 0,
    ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
  });
  return object;
}
