import "server-only";
import { CAPTION_PROMPT, CAPTION_PROMPT_VERSION } from "./caption-prompt";

export class CaptionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "caption_generation_failed",
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "CaptionError";
  }
}

type OpenAIResponse = {
  status?: string;
  model?: string;
  output?: {
    type: string;
    content?: { type: string; text?: string }[];
  }[];
};

const QUOTA_CODES = new Set([
  "insufficient_quota", "credit_balance_exhausted", "billing_hard_limit_reached",
  "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
  "organization_usage_limit_exceeded",
]);

function retryDelay(header: string | null) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function waitForRetry(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function generateCaption(bytes: Uint8Array, mimeType: string, context: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CaptionError("Caption generation is not configured yet.", 503);
  }
  const model = process.env.OPENAI_CAPTION_MODEL || "gpt-4.1-mini";
  // All attempts and delays share one deadline, leaving time for upload cleanup.
  const signal = AbortSignal.timeout(45_000);
  let response: Response;
  try {
    for (let attempt = 0; ; attempt++) {
      response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: CAPTION_PROMPT,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: context ? `Optional image context (source material): ${JSON.stringify(context)}` : "No extra context. Write a caption for this image." },
            { type: "input_image", image_url: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`, detail: "auto" },
          ],
        }],
        max_output_tokens: 512,
        store: false,
      }),
      signal,
      cache: "no-store",
    });
      if (response.ok) break;

      const failure = await response.json().catch(() => null) as {
        error?: { code?: string; type?: string };
      } | null;
      const code = failure?.error?.code;
      const type = failure?.error?.type;
      // Log only structured diagnostics, never keys, image bytes, or raw messages.
      console.error("Caption service request failed:", {
        status: response.status, code, type,
        requestId: response.headers.get("x-request-id"), model,
      });
      if ((code && QUOTA_CODES.has(code)) || type === "insufficient_quota") {
        throw new CaptionError(
          "Caption generation is unavailable because the app's OpenAI API credits or usage limit have been reached. The app owner needs to check OpenAI API billing and project limits.",
          503, "openai_quota_exceeded",
        );
      }

      const temporary = (response.status === 429 &&
        (type === "rate_limit_error" || code === "rate_limit_exceeded" || code === "slow_down")) ||
        (response.status === 503 && code === "server_is_overloaded");
      const serverDelay = retryDelay(response.headers.get("retry-after"));
      const delay = (serverDelay ?? 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
      // Defer long delays to the user instead of retrying earlier than OpenAI asks.
      if (temporary && attempt < 2 && delay <= 5000) {
        await waitForRetry(delay, signal);
        continue;
      }
      if (temporary) {
        const retryAfterSeconds = Math.max(1, Math.ceil((serverDelay ?? delay) / 1000));
        throw new CaptionError(
          `The caption service is temporarily rate-limited or busy. Please wait ${retryAfterSeconds} seconds before trying again.`,
          response.status === 429 ? 429 : 503, "openai_rate_limited", retryAfterSeconds,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new CaptionError("The caption service's API key or project access needs to be checked by the app owner.", 503, "openai_access_error");
      }
      throw new CaptionError("Caption generation failed. Please try again.", 502);
    }
  } catch (error) {
    if (error instanceof CaptionError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
      throw new CaptionError("Caption generation took too long. Please try again.", 504);
    }
    throw new CaptionError("Could not reach the caption service. Please try again.", 502);
  }

  let result: OpenAIResponse;
  try {
    result = await response.json() as OpenAIResponse;
  } catch {
    throw new CaptionError("The caption service returned an invalid response. Please try again.", 502);
  }
  const content = (result.output ?? []).filter(item => item.type === "message").flatMap(item => item.content ?? []);
  if (content.some(item => item.type === "refusal")) {
    throw new CaptionError("A caption could not be generated for this image. Try another image or context.", 422);
  }
  const caption = content.filter(item => item.type === "output_text").map(item => item.text ?? "").join("").trim();
  if (result.status !== "completed" || !caption || caption.length > 200 || caption.split(/\s+/).length > 25 || /[\r\n]/.test(caption)) {
    throw new CaptionError("The caption service did not return a usable short caption. Please try again.", 502);
  }

  return { caption, generation_prompt: CAPTION_PROMPT, prompt_version: CAPTION_PROMPT_VERSION, model: result.model || model };
}
