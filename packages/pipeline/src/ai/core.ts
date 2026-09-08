import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject, type LanguageModel, type ModelMessage } from "ai";
import type { ZodType } from "zod";
import { db, llmUsageLogs } from "@classifieds/db";

const google = createGoogleGenerativeAI({
  apiKey:
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY,
});
const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * OpenRouter fronts every provider behind one key, which matters here because
 * a second vertical means comparing extraction quality across models — tedious
 * when each candidate needs its own account and SDK.
 *
 * Constructed lazily: the factory throws without a key, and the module is
 * imported by code paths that never reach inference.
 */
let openrouterClient: ReturnType<typeof createOpenAICompatible> | null = null;
function openrouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter (or when the model id is namespaced, e.g. "google/gemini-2.5-flash")',
    );
  }
  // Reached through the OpenAI-compatible provider rather than the dedicated
  // @openrouter package: that package targets a newer AI SDK model spec than
  // the `ai` version here accepts. OpenRouter's API is OpenAI-shaped, so this
  // is the supported path and one less version to keep in step.
  openrouterClient ??= createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      // OpenRouter uses these for attribution on its dashboard.
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://localhost",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Classifieds",
    },
  });
  return openrouterClient;
}

const DEFAULT_MODEL = process.env.LLM_MODEL ?? "gemini-2.5-flash";
const DEFAULT_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 5);

function resolveModel(modelId: string): {
  model: LanguageModel;
  provider: string;
} {
  const explicitProvider = process.env.LLM_PROVIDER?.toLowerCase();
  const provider = explicitProvider ?? inferProvider(modelId);
  switch (provider) {
    case "google":
      return { model: google(modelId), provider };
    case "anthropic":
      return { model: anthropic(modelId), provider };
    case "openrouter":
      return { model: openrouter().chatModel(modelId), provider };
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

function inferProvider(modelId: string): string {
  // OpenRouter model ids are namespaced ("google/gemini-2.5-flash",
  // "anthropic/claude-sonnet-4"), which is an unambiguous signal — a bare
  // "gemini-2.5-flash" still routes direct to Google.
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  throw new Error(
    `Cannot infer provider for model "${modelId}". Set LLM_PROVIDER=google|anthropic|openrouter explicitly.`,
  );
}

async function logUsage(entry: {
  provider: string;
  model: string;
  operation: string;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(llmUsageLogs).values({
      provider: entry.provider,
      model: entry.model,
      operation: entry.operation,
      latencyMs: entry.latencyMs,
      success: entry.success,
      errorMessage: entry.errorMessage ?? null,
      inputTokens: entry.usage?.inputTokens ?? null,
      outputTokens: entry.usage?.outputTokens ?? null,
      cachedInputTokens: entry.usage?.cachedInputTokens ?? null,
      reasoningTokens: entry.usage?.reasoningTokens ?? null,
      totalTokens: entry.usage?.totalTokens ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.warn(
      `[ai/core] failed to record usage: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
  operation: string;
  metadata?: Record<string, unknown>;
};

export async function generateStructured<T>(
  options: StructuredOptions<T>,
): Promise<T> {
  const modelId = options.model ?? DEFAULT_MODEL;
  const { model, provider } = resolveModel(modelId);
  const startedAt = Date.now();
  try {
    const result = await generateObject({
      model,
      schema: options.schema,
      schemaName: options.schemaName,
      system: options.system,
      messages: options.messages,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      temperature: options.temperature ?? 0,
      ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
    });
    const usage = result.usage as
      | {
          inputTokens?: number;
          outputTokens?: number;
          cachedInputTokens?: number;
          reasoningTokens?: number;
          totalTokens?: number;
        }
      | undefined;
    await logUsage({
      provider,
      model: modelId,
      operation: options.operation,
      latencyMs: Date.now() - startedAt,
      success: true,
      usage,
      metadata: options.metadata,
    });
    return result.object;
  } catch (err) {
    await logUsage({
      provider,
      model: modelId,
      operation: options.operation,
      latencyMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      metadata: options.metadata,
    });
    throw err;
  }
}
