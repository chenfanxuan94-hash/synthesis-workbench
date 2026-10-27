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
        <h1>Synthesis Workbench</h1>
        <p>Pick your name to continue.</p>
        {error === "code" && <div className="err">The team code was not correct.</div>}
        {error === "member" && <div className="err">That name was not found.</div>}
        <form action={login}>
          {needsCode && (
            <div className="mb">
              <label className="block">
                Team code
                <Help text="A single shared code set by the administrator. It is the only thing standing between the public internet and this workspace, so do not paste it anywhere public." />
              </label>
              <input type="password" name="code" required style={{ width: "100%" }} />
            </div>
          )}
          {members.map((m) => (
            <button key={m.id} type="submit" name="member" value={m.id} className="name">
              {m.name}
            </button>
          ))}
        </form>
        <h3 className="mt">
          Add a name
          <Help text="Adds a team member. Names appear on this page and on every decision, coding and extraction they make." />
        </h3>
        <form action={addMember} className="row">
          <input type="text" name="name" placeholder="Full name" required />
          <button type="submit">Add</button>
        </form>
      </div>
    </main>
  );
}
