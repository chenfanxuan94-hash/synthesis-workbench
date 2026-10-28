// Small formatting helpers shared by server and client components.

export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return "";
  return t.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many || one + "s"}`;
}

// Human wording for an activity row.
export function describeAction(action: string, detail: string | null): string {
  switch (action) {
    case "added": return detail ? `added the paper (${detail})` : "added the paper";
    case "pdf": return "attached a PDF";
    case "details": return "edited the paper details";
    case "vote": return detail ? `voted ${detail}` : "voted";
    case "pi_decision": return detail ? `recorded the final decision: ${detail}` : "cleared the final decision";
    case "coding": return "saved the study features";
    case "done": return "marked the paper done";
    case "reopened": return "reopened the paper";
    case "effect_add": return detail ? `added an effect row (${detail})` : "added an effect row";
    case "effect_edit": return detail ? `edited an effect row (${detail})` : "edited an effect row";
    case "effect_delete": return detail ? `deleted an effect row (${detail})` : "deleted an effect row";
    case "ai_draft": return detail ? `asked the AI for a draft (${detail})` : "asked the AI for a draft";
    case "search": return detail ? `ran a search: ${detail}` : "ran a search";
    case "screen": return detail ? `screened it: ${detail}` : "screened it";
    case "screened_in": return "moved it to the master list";
    case "screen_decision": return detail ? `recorded the screening decision: ${detail}` : "cleared the screening decision";
    case "back_to_search": return "sent it back to the search list";
    case "ai_screen": return detail ? `asked the AI to pre-screen (${detail})` : "asked the AI to pre-screen";
    default: return detail ? `${action}: ${detail}` : action;
  }
}
