// The workflow, in the order the team works through it. The list page, the guide and the
// in-task instructions all read from this list.

export type Task = "screen" | "vote" | "code";

export type Step = {
  n: number;
  title: string;
  what: string;
  who: string;
  href: string;
  go: string;
  task?: Task;
};

export const STEPS: Step[] = [
  {
    n: 1, title: "Find and screen papers", who: "Everyone",
    what: "Search PubMed, OpenAlex, ERIC and Semantic Scholar from the app with your keywords, or add papers you already know. Read each title and abstract and mark it Relevant or Not relevant. Relevant papers move to the master list.",
    href: "/search", go: "Open the search list", task: "screen",
  },
  {
    n: 2, title: "Vote on papers", who: "Everyone",
    what: "Attach the PDF, read it, and vote Include or Exclude. A paper is approved once two people vote Include and nobody votes Exclude.",
    href: "/work/vote", go: "Start voting", task: "vote",
  },
  {
    n: 3, title: "Code approved papers", who: "Everyone, on a shared form",
    what: "Record the study features and copy the numbers by group. AI can draft both from the paper; you check them. Mark the paper done when finished.",
    href: "/work/code", go: "Start coding", task: "code",
  },
  {
    n: 4, title: "Download the dataset", who: "Whoever runs the analysis",
    what: "One Excel file with every row from the approved papers, ready for analysis, plus the search log for the PRISMA diagram.",
    href: "/dataset", go: "Open the dataset",
  },
];

export const TASK_STEP: Record<Task, Step> = {
  screen: STEPS[0],
  vote: STEPS[1],
  code: STEPS[2],
};

export function stepByNumber(n: number): Step {
  return STEPS.find((s) => s.n === n) || STEPS[0];
}

export const TASK_ORDER: Task[] = ["screen", "vote", "code"];

export function isTask(v: unknown): v is Task {
  return typeof v === "string" && (TASK_ORDER as string[]).includes(v);
}
