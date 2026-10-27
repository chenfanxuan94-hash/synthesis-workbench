export const maxDuration = 60;
import { NextResponse, type NextRequest } from "next/server";
import { db, PDF_BUCKET } from "@/lib/supabase";

// Redirects to a short-lived signed URL for the paper's PDF so the browser's own viewer can render it.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = db();
  const { data } = await d.from("papers").select("pdf_path").eq("id", id).maybeSingle();
  if (!data?.pdf_path) return NextResponse.json({ error: "no pdf" }, { status: 404 });
  const { data: signed, error } = await d.storage.from(PDF_BUCKET).createSignedUrl(data.pdf_path, 60 * 60);
  if (error || !signed) return NextResponse.json({ error: error?.message || "sign failed" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, 302);
}
