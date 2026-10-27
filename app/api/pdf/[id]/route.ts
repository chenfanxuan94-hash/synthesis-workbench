export const maxDuration = 60;
import { NextResponse, type NextRequest } from "next/server";
import { db, PDF_BUCKET } from "@/lib/supabase";

// Gives out a short-lived signed link for the paper's PDF.
// With ?format=url the link comes back as JSON (used by the viewer); otherwise the browser is
// redirected to it (used by "Open in new tab").
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = db();
  const { data } = await d.from("papers").select("pdf_path").eq("id", id).maybeSingle();
  if (!data?.pdf_path) return NextResponse.json({ error: "no pdf" }, { status: 404 });
  const { data: signed, error } = await d.storage.from(PDF_BUCKET).createSignedUrl(data.pdf_path, 60 * 60);
  if (error || !signed) return NextResponse.json({ error: error?.message || "sign failed" }, { status: 500 });
  if (req.nextUrl.searchParams.get("format") === "url") {
    return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}
