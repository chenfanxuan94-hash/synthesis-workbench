import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import type { Member } from "./types";

export const COOKIE = "wb_member";

function toMember(row: any): Member {
  return { id: row.id, name: row.name, initials: row.initials, is_pi: row.is_pi === true };
}

export async function currentMember(): Promise<Member | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const { data } = await db().from("members").select("*").eq("id", id).maybeSingle();
  return data ? toMember(data) : null;
}

export async function requireMember(): Promise<Member> {
  const m = await currentMember();
  if (!m) redirect("/login");
  return m;
}

export async function allMembers(): Promise<Member[]> {
  const { data } = await db().from("members").select("*").order("name");
  return ((data || []) as any[]).map(toMember);
}
