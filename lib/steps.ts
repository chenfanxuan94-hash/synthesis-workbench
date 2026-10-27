// The workflow, in the order the team works through it. Home, the guide and the
// in-task instructions all read from this list.

export type Task = "vote" | "code";

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
    n: 1, title: "Add papers", who: "Anyone",
    what: "Upload PDFs or import search results. Every paper lands in one master list.",
    href: "/papers/new", go: "Add papers",
  },
  {
    n: 2, title: "Vote on papers", who: "Everyone",
    what: "Read the title, abstract, or PDF and vote Include or Exclude. A paper is approved once two people vote Include and nobody votes Exclude.",
    href: "/work/vote", go: "Start voting", task: "vote",
  },
  {
    n: 3, title: "Code approved papers", who: "Everyone, on a shared form",
    what: "Record the study features and copy the numbers by group. AI can draft the numbers from a screenshot; you check them. Mark the paper done when finished.",
    href: "/work/code", go: "Start coding", task: "code",
  },
  {
    n: 4, title: "Download the dataset", who: "Whoever runs the analysis",
    what: "One Excel file with every row from the approved papers, ready for analysis.",
    href: "/dataset", go: "Open dataset",
  },
];

export const TASK_STEP: Record<Task, Step> = {
  vote: STEPS[1],
  code: STEPS[2],
};

export function stepByNumber(n: number): Step {
  return STEPS.find((s) => s.n === n) || STEPS[0];
}

export const TASK_ORDER: Task[] = ["vote", "code"];

export function isTask(v: unknown): v is Task {
  return typeof v === "string" && (TASK_ORDER as string[]).includes(v);
}
