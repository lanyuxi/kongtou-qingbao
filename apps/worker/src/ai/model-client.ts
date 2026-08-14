// Injectable structured-output model client. The default implementation talks
// to any OpenAI-compatible chat completions endpoint (DeepSeek, GLM, vLLM...).

export interface StructuredCompletionInput {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxOutputTokens: number;
}

export interface StructuredCompletionResult {
  readonly jsonText: string;
  readonly modelId: string;
  readonly latencyMs: number;
  readonly usage: unknown;
}

export interface StructuredModelClient {
  completeJson(input: StructuredCompletionInput): Promise<StructuredCompletionResult>;
}

export class ModelProviderError extends Error {
  readonly code = 'provider_error' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleModelClientOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: FetchLike;
  readonly clock?: () => number;
}

interface ChatCompletionsResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: unknown };
  }>;
  readonly usage?: unknown;
  readonly error?: { readonly message?: unknown };
}

export function createOpenAiCompatibleModelClient(
  options: OpenAiCompatibleModelClientOptions,
): StructuredModelClient {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const clock = options.clock ?? Date.now;

  return {
    async completeJson(input) {
      const startedAt = clock();
      let response: Response;
      try {
        response = await fetchImpl(`${options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            response_format: { type: 'json_object' },
            max_tokens: input.maxOutputTokens,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
            ],
          }),
        });
      } catch (cause) {
        throw new ModelProviderError(cause instanceof Error ? cause.message : 'fetch_failed');
      }

      if (!response.ok) {
        throw new ModelProviderError(`http_${response.status}`);
      }

      let body: ChatCompletionsResponse;
      try {
        body = (await response.json()) as ChatCompletionsResponse;
      } catch (cause) {
        throw new ModelProviderError(cause instanceof Error ? cause.message : 'invalid_json_body');
      }

      if (body.error !== undefined) {
        throw new ModelProviderError('provider_returned_error');
      }

      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.length === 0) {
        throw new ModelProviderError('empty_completion');
      }

      return {
        jsonText: content,
        modelId: options.model,
        latencyMs: Math.max(0, clock() - startedAt),
        usage: body.usage ?? null,
      };
    },
  };
}
