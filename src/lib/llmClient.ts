/**
 * LLM Client – calls the cache service's /llm/complete endpoint.
 *
 * Falls back to the existing mock LLM if the backend is unreachable.
 */

import { simulateLLMResponse } from "./mockLLM";

const CACHE_SERVICE_URL =
    import.meta.env.VITE_CACHE_SERVICE_URL ?? "http://localhost:8000";

export interface LLMCompletionResult {
    response: string;
    provider: "dell" | "gemini" | "mock" | "mock-fallback";
}

/**
 * Send a prompt to the backend LLM provider and return the response.
 *
 * @param prompt - The user/compressed prompt to send
 * @param systemPrompt - Optional system instruction
 * @returns The LLM response text and the provider name
 */
export async function queryLLM(
    prompt: string,
    systemPrompt?: string
): Promise<string> {
    const result = await queryLLMWithMeta(prompt, systemPrompt);
    return result.response;
}

/**
 * Same as queryLLM but also returns provider metadata.
 */
export async function queryLLMWithMeta(
    prompt: string,
    systemPrompt?: string
): Promise<LLMCompletionResult> {
    try {
        const res = await fetch(`${CACHE_SERVICE_URL}/llm/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                system_prompt: systemPrompt ?? "",
            }),
        });

        if (!res.ok) {
            console.warn(`LLM backend returned ${res.status}, falling back to mock`);
            const fallback = await simulateLLMResponse(prompt);
            return { response: fallback, provider: "mock-fallback" };
        }

        const data = await res.json();
        return {
            response: data.response,
            provider: data.provider,
        };
    } catch (err) {
        console.warn("LLM backend unreachable, falling back to mock:", err);
        const fallback = await simulateLLMResponse(prompt);
        return { response: fallback, provider: "mock-fallback" };
    }
}
