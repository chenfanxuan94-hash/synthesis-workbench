export const maxDuration = 60;
import { type NextRequest } from "next/server";
import { buildDataset, toCSV } from "@/lib/dataset";

export async function GET(req: NextRequest) {
  const verifiedOnly = req.nextUrl.searchParams.get("verified") === "1";
  const rows = await buildDataset({ verifiedOnly });
  const csv = toCSV(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gap_effects_${verifiedOnly ? "verified_" : ""}${stamp}.csv"`,
    },
  });
}
