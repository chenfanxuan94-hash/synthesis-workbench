import { NextResponse, type NextRequest } from "next/server";
import { lookupDOI, searchCrossref } from "@/lib/crossref";

export async function GET(req: NextRequest) {
  const doi = req.nextUrl.searchParams.get("doi");
  const q = req.nextUrl.searchParams.get("q");
  if (doi) return NextResponse.json({ hit: await lookupDOI(doi) });
  if (q) return NextResponse.json({ hits: await searchCrossref(q) });
  return NextResponse.json({ error: "doi or q required" }, { status: 400 });
}
