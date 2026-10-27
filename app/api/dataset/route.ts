export const maxDuration = 60;
import { type NextRequest } from "next/server";
import { requireMember } from "@/lib/session";
import { buildDataset, toCSV, toXLSX } from "@/lib/dataset";

// Downloads the dataset: Excel by default, CSV with ?format=csv. Approved papers only.
export async function GET(req: NextRequest) {
  await requireMember();
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const ds = await buildDataset();
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new Response(toCSV(ds.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="chhsr_meta_effects_${stamp}.csv"`,
      },
    });
  }
  const buf = await toXLSX(ds);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="chhsr_meta_dataset_${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
