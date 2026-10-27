// Server-only call to the Claude API (Messages endpoint) that asks for one tool call and
// returns its input as JSON. No SDK: one fetch, so there is nothing else to install.

export type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type ToolCall = {
  system: string;
  blocks: ClaudeBlock[];
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  maxTokens?: number;
};

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export async function callClaudeTool<T = unknown>(call: ToolCall): Promise<{ ok: true; input: T; model: string } | { ok: false; error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Claude is not set up yet. Fan needs to add ANTHROPIC_API_KEY to the Vercel project settings." };
  const body = {
    model: AI_MODEL,
    max_tokens: call.maxTokens || 4000,
    system: call.system,
    tools: [call.tool],
    tool_choice: { type: "tool", name: call.tool.name },
    messages: [{ role: "user", content: call.blocks }],
  };
  let res: Response;
  try {
    res = await fetch((process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(50_000),
    });
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { ok: false, error: timeout ? "Claude took too long to answer. Try a smaller screenshot or fewer pages." : "Could not reach Claude: " + (e?.message || "network error") };
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: "Claude returned an error: " + msg };
  }
  const block = (json?.content || []).find((b: any) => b.type === "tool_use" && b.name === call.tool.name);
  if (!block) return { ok: false, error: "Claude answered without filling in the form. Try again, or give a hint about which table to read." };
  return { ok: true, input: block.input as T, model: json.model || AI_MODEL };
}
