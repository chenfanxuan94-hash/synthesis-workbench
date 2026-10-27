import { addMember, login } from "@/lib/actions";
import { allMembers } from "@/lib/session";
import Help from "@/components/Help";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const members = await allMembers();
  const { error } = await searchParams;
  const needsCode = Boolean(process.env.TEAM_CODE);
  return (
    <main>
      <div className="login">
        <div className="band">
          <h1>Synthesis Workbench</h1>
          <p>School-based behavioral health and the gaps between groups of students</p>
        </div>
        <div className="inner">
          {error === "code" && <div className="err">The team code was not correct.</div>}
          {error === "member" && <div className="err">That name was not found.</div>}
          <form action={login}>
            {needsCode && (
              <div className="mb">
                <label className="block">
                  Team code
                  <Help text="A shared code Fan gives the team. Do not post it anywhere public." />
                </label>
                <input type="password" name="code" required style={{ width: "100%" }} />
              </div>
            )}
            <p><b>Who are you?</b> Click your name. No password is needed.</p>
            {members.map((m) => (
              <button key={m.id} type="submit" name="member" value={m.id} className="name">
                <span className="stepnum">{m.initials}</span>
                {m.name}
              </button>
            ))}
          </form>
          <div className="note info mt">
            <b>First time here?</b> After you click your name, press <b>Start here</b> in the maroon bar at the top. It explains everything in about fifteen minutes.
          </div>
          <details className="mt">
            <summary><b>Your name is not on the list?</b></summary>
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
