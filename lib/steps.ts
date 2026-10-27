// The workflow, in the order the team works through it. The dashboard, the guide,
// the nav and the in-task instructions all read from this list.

export type Task = "abstract" | "fulltext" | "code" | "extract" | "verify";

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
    n: 0, title: "Read the guide", who: "Everyone, once",
    what: "About fifteen minutes. Explains the project, the words we use, and each step below.",
    href: "/guide", go: "Open the guide",
  },
  {
    n: 1, title: "Add papers", who: "Usually Fan",
    what: "Upload PDFs or import search results so they appear in the library.",
    href: "/papers/new", go: "Add papers",
  },
  {
    n: 2, title: "Screen titles and abstracts", who: "Two people per paper",
    what: "Read the title and abstract and decide whether the paper might fit. When in doubt, include.",
    href: "/work/abstract", go: "Start screening", task: "abstract",
  },
  {
    n: 3, title: "Screen full texts", who: "Two people per paper",
    what: "Read the full paper and check every eligibility rule. This is the strict step.",
    href: "/work/fulltext", go: "Start full-text screening", task: "fulltext",
  },
  {
    n: 4, title: "Resolve disagreements", who: "The two screeners together",
    what: "Where the two screeners disagreed, talk it through and record the agreed decision.",
    href: "/conflicts", go: "Open disagreements",
  },
  {
    n: 5, title: "Code study features", who: "Two people per paper",
    what: "For each included paper, record what kind of program it was and how results are reported.",
    href: "/work/code", go: "Start coding", task: "code",
  },
  {
    n: 6, title: "Extract the numbers", who: "One person per paper",
    what: "For papers that report results by race, ethnicity, or income, copy the numbers into the form.",
    href: "/work/extract", go: "Start extracting", task: "extract",
  },
  {
    n: 7, title: "Check someone else's numbers", who: "A different person",
    what: "Compare each number another person entered against the paper, then mark it verified.",
    href: "/work/verify", go: "Start checking", task: "verify",
  },
  {
    n: 8, title: "Download the dataset", who: "Usually Fan",
    what: "Export every verified row as a spreadsheet for the analysis.",
    href: "/dataset", go: "Open dataset",
  },
];

export const TASK_STEP: Record<Task, Step> = {
  abstract: STEPS[2],
  fulltext: STEPS[3],
  code: STEPS[5],
  extract: STEPS[6],
  verify: STEPS[7],
};

export const TASK_ORDER: Task[] = ["abstract", "fulltext", "code", "extract", "verify"];

export function taskTab(task: Task): "screen" | "code" | "effects" {
  if (task === "abstract" || task === "fulltext") return "screen";
  if (task === "code") return "code";
  return "effects";
}

export function isTask(v: unknown): v is Task {
  return typeof v === "string" && (TASK_ORDER as string[]).includes(v);
}
