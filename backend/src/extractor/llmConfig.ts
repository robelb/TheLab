export type LlmProvider = "openai" | "gemini";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Prefer OpenAI when OPENAI_API_KEY is set; otherwise use Gemini. */
export function resolveLlmConfig(): LlmConfig | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      provider: "openai",
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    return {
      provider: "gemini",
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
    };
  }

  return null;
}

export function missingLlmConfigMessage(): string {
  return (
    "Server missing AI credentials. Set OPENAI_API_KEY or GEMINI_API_KEY in backend/.env " +
    "(OpenAI is used when OPENAI_API_KEY is present)."
  );
}
