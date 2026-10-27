// Server-only call to the Claude API (Messages endpoint) that asks for one tool call and
// returns its input as JSON. No SDK: one fetch, so there is nothing else to install.
//
// The tool is offered but not forced: newer models reject tool_choice "tool" and "any".
// The system text tells the model to answer through the tool; if it answers in prose with a
// JSON object instead, that JSON is read as the answer.

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

// Pulls a JSON object out of a prose answer: a ```json fence first, then the outermost braces.
export function jsonFromText(text: string): Record<string, unknown> | null {
  const tries: string[] = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) tries.push(fenced[1]);
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(text.slice(a, b + 1));
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* not JSON, try the next */ }
  }
  return null;
}

export async function callClaudeTool<T = unknown>(call: ToolCall): Promise<{ ok: true; input: T; model: string } | { ok: false; error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI drafts are not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings." };
  const name = call.tool.name;
  const body = {
    model: AI_MODEL,
    max_tokens: call.maxTokens || 4000,
    system: call.system + `\n\nAnswer by calling the ${name} tool with the complete result. Do not answer in prose. If for any reason you cannot call the tool, reply with only the JSON object the tool expects, nothing else.`,
    tools: [call.tool],
    messages: [{ role: "user", content: [...call.blocks, { type: "text", text: `Now call the ${name} tool with your answer.` }] }],
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
    return { ok: false, error: timeout ? "The AI took too long to answer. Try a smaller screenshot or fewer pages." : "Could not reach the AI service: " + (e?.message || "network error") };
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: "The AI service returned an error: " + msg };
  }
  const content: any[] = Array.isArray(json?.content) ? json.content : [];
  const block = content.find((b) => b.type === "tool_use" && b.name === name);
  if (block && block.input && typeof block.input === "object") return { ok: true, input: block.input as T, model: json.model || AI_MODEL };
  const text = content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
  const parsed = jsonFromText(text);
  if (parsed) return { ok: true, input: parsed as T, model: json.model || AI_MODEL };
  if (json?.stop_reason === "max_tokens") return { ok: false, error: "The answer was too long to finish. Try a smaller screenshot, fewer pages, or a hint naming one table." };
  return { ok: false, error: "The AI answered without filling in the form. Try again, or give a hint about which table to read." };
}
