// Allow-listed providers for bring-your-own-key. Safe to import client-side (no secrets).
// Prices are USD per 1M tokens (input / output), from each provider's pricing page on 2026-10-28.

export interface ModelOption {
  id: string;
  note: string;
  price?: [number, number];
}

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  logo?: string; // /logos/*.svg when a mark exists
  models: ModelOption[]; // first = default
  keyHint: string;
  keyUrl: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "opencode",
    label: "OpenCode Zen",
    logo: "/logos/opencode.png",
    baseUrl: "https://opencode.ai/zen/v1",
    models: [
      { id: "deepseek-v4.1-flash", note: "default · fast, cheap, solid reasoning", price: [0.3, 1.2] },
      { id: "qwen3.8-flash", note: "cheapest · lighter guides", price: [0.15, 0.47] },
      { id: "deepseek-v4-pro", note: "deeper reasoning, ~6× cost", price: [1.74, 3.48] },
      { id: "kimi-k3", note: "premium, long context", price: [3, 15] },
    ],
    keyHint: "oc_sk_…",
    keyUrl: "https://opencode.ai/zen",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    logo: "/logos/openrouter.png",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "deepseek/deepseek-chat", note: "DeepSeek via OpenRouter" },
      { id: "google/gemini-flash-latest", note: "Gemini Flash via OpenRouter" },
      { id: "anthropic/claude-haiku-4.5", note: "Claude Haiku via OpenRouter" },
    ],
    keyHint: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    logo: "/logos/openai.svg",
    models: [
      { id: "gpt-5.4-mini", note: "balanced" },
      { id: "gpt-5.4-nano", note: "cheapest OpenAI" },
    ],
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    logo: "/logos/deepseek.png",
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", note: "direct from DeepSeek" },
      { id: "deepseek-reasoner", note: "reasoning model" },
    ],
    keyHint: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "groq",
    label: "Groq",
    logo: "/logos/groq.png",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [{ id: "llama-3.3-70b-versatile", note: "very fast, free tier available" }],
    keyHint: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    logo: "/logos/googlegemini.svg",
    models: [
      { id: "gemini-3-flash-preview", note: "free tier: ~20 requests/day" },
      { id: "gemini-3.1-flash-lite", note: "free tier, thinner guides" },
    ],
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
  },
];

/** Rough cost of one guide (~45k input, ~8k output tokens). */
export function guideCost(price?: [number, number]): string | null {
  if (!price) return null;
  const c = (45_000 * price[0] + 8_000 * price[1]) / 1e6;
  return c < 0.01 ? "<1¢" : `~${Math.round(c * 100)}¢`;
}
