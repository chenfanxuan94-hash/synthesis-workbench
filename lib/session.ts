import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import type { Member } from "./types";

export const COOKIE = "wb_member";

export async function currentMember(): Promise<Member | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const { data } = await db().from("members").select("id,name,initials").eq("id", id).maybeSingle();
  return (data as Member) || null;
}

export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect("/login");
  return m;
}

export async function allMembers(): Promise<Member[]> {
  const { data } = await db().from("members").select("id,name,initials").order("name");
  return (data as Member[]) || [];
}
