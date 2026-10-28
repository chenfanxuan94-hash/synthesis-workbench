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

// Which model reads the papers. Opus 5.5 is the most careful reader of tables; set
// ANTHROPIC_MODEL in Vercel to switch without a code change (claude-sonnet-5-5 is faster and cheaper).
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// How hard the model thinks before it answers: low, medium, high, xhigh or max. Medium is
// careful enough for a results table and still answers within a minute or two.
export const AI_EFFORT = process.env.ANTHROPIC_EFFORT || "medium";

// The model thinks before it answers, and that thinking counts against max_tokens, so the
// request leaves this much room on top of the answer a caller asks for.
const THINKING_ROOM = 8000;

// Give up before Vercel does (the paper page allows 300 seconds).
const TIMEOUT_MS = 240_000;

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

export type ToolResult<T> = { ok: true; input: T; model: string; stop: string; truncated: boolean } | { ok: false; error: string };

type Sent = { res: Response; json: any } | { error: string };

async function send(body: Record<string, unknown>, key: string): Promise<Sent> {
  let res: Response;
  try {
    res = await fetch((process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e: any) {
    const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return { error: timeout ? "The AI took too long to answer. Try again, or try a smaller screenshot or fewer pages." : "Could not reach the AI service: " + (e?.message || "network error") };
  }
  const json: any = await res.json().catch(() => null);
  return { res, json };
}

export async function callClaudeTool<T = unknown>(call: ToolCall): Promise<ToolResult<T>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "AI drafts are not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings." };
  const name = call.tool.name;
  const body: Record<string, unknown> = {
    model: AI_MODEL,
    max_tokens: (call.maxTokens || 4000) + THINKING_ROOM,
    output_config: { effort: AI_EFFORT },
    system: call.system + `\n\nCall the ${name} tool right away with the complete result. Do not write anything before or after the tool call. If for any reason you cannot call the tool, reply with only the JSON object the tool expects, nothing else.`,
    tools: [call.tool],
    messages: [{ role: "user", content: [...call.blocks, { type: "text", text: `Now call the ${name} tool with your answer.` }] }],
  };
  let sent = await send(body, key);
  // A model that does not take an effort setting rejects the whole request; ask again without it.
  if (!("error" in sent) && !sent.res.ok && body.output_config && sent.res.status === 400 && /output_config|effort/i.test(String(sent.json?.error?.message || ""))) {
    console.log("ai effort setting not accepted by " + AI_MODEL + ", retrying without it");
    delete body.output_config;
    sent = await send(body, key);
  }
  if ("error" in sent) return { ok: false, error: sent.error };
  const { res, json } = sent;
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    return { ok: false, error: "The AI service returned an error: " + msg };
  }
  const content: any[] = Array.isArray(json?.content) ? json.content : [];
  const stop = String(json?.stop_reason || "");
  const truncated = stop === "max_tokens";
  const model = json?.model || AI_MODEL;
  // Shape only, never content: enough to see in the Vercel logs why an answer did not fit the form.
  console.log("ai answer", JSON.stringify({ tool: name, model, effort: body.output_config ? AI_EFFORT : "default", stop, blocks: content.map((b) => b.type), usage: json?.usage }));
  // Thinking blocks, if the model returns any, are simply skipped: only the tool call or the text counts.
  const block = content.find((b) => b.type === "tool_use" && b.name === name);
  let input: any = block?.input;
  if (typeof input === "string") input = jsonFromText(input) ?? null;
  if (input && typeof input === "object") return { ok: true, input: input as T, model, stop, truncated };
  const text = content.filter((b) => b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
  const parsed = jsonFromText(text);
  if (parsed) return { ok: true, input: parsed as T, model, stop, truncated };
  if (truncated) return { ok: false, error: "The answer was too long to finish. Try a smaller screenshot, fewer pages, or a hint naming one table." };
  return { ok: false, error: "The AI answered without filling in the form. Try again, or give a hint about which table to read." };
}
