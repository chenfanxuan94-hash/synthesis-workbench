import { addMember, login } from "@/lib/actions";
import { allMembers } from "@/lib/session";
import Help from "@/components/Help";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const members = await allMembers();
  const { error } = await searchParams;
  const needsCode = Boolean(process.env.TEAM_CODE);
  return (
    <main className="center">
      <h1 className="brand-title">CHHSR Meta Analysis Portal</h1>
      <p className="hello">Click your name to begin. No password needed.</p>
      <div className="login">
        <div className="panel">
          {error === "code" && <div className="err">The team code was not correct.</div>}
          {error === "member" && <div className="err">That name was not found.</div>}
          <form action={login}>
            {needsCode && (
              <div className="mb">
                <label className="block">
                  Team code
                  <Help text="A shared code the team agreed on. Do not post it anywhere public." />
                </label>
                <input type="password" name="code" required style={{ width: "100%" }} />
              </div>
            )}
            {members.map((m) => (
              <button key={m.id} type="submit" name="member" value={m.id} className="name">
                <span className="stepnum">{m.initials}</span>
                {m.name}
              </button>
            ))}
          </form>
          <details className="mt">
            <summary className="muted" style={{ cursor: "pointer" }}>Your name is not on the list?</summary>
            <form action={addMember} className="row mt">
              <input type="text" name="name" placeholder="Your full name" required />
              <button type="submit">Add me</button>
            </form>
          </details>
        </div>
      </div>
    </main>
  );
}
