// The study-feature coding form: one definition shared by the form, the AI fill, and the codebook.
import {
  STUDY_DESIGNS, TARGETING_LEVELS, CULTURAL_ADAPTATION, ADAPTATION_DEPTH,
  DELIVERY_AGENTS, RISK_OF_BIAS, SETTINGS, REPORTING_LEVELS, MEASURE_VALIDATION,
} from "./config";

export type CodingField = { key: string; label: string; help: string; type: "select" | "number" | "bool"; options?: string[]; ai: string };

// `ai` is the instruction the model gets for that field, in addition to the help text.
export const CODING_FIELDS: Record<string, CodingField> = {
  study_design: { key: "study_design", label: "Study design", type: "select", options: STUDY_DESIGNS, help: "RCT: students were assigned by chance. Cluster RCT: whole classrooms or schools were assigned by chance. Quasi-experiment: no chance assignment, but a similar control group was used.", ai: "Choose Cluster RCT when schools, classrooms, or sites were randomized; RCT when individual students were; Quasi-experiment for matched or statistically controlled comparison groups without random assignment." },
  setting: { key: "setting", label: "School level", type: "select", options: SETTINGS, help: "The grades of the students in the study. Mixed if it covers more than one level.", ai: "Elementary is roughly grades K to 5, Middle 6 to 8, High school 9 to 12. Mixed when the sample spans more than one level." },
  age_min: { key: "age_min", label: "Youngest age", type: "number", help: "In years. If the paper gives grades only, leave blank and write the grades in the notes.", ai: "The youngest age in years stated for the sample. Null if only grades are given." },
  age_max: { key: "age_max", label: "Oldest age", type: "number", help: "In years.", ai: "The oldest age in years stated for the sample. Null if only grades are given." },
  n_total: { key: "n_total", label: "Number of students", type: "number", help: "The total number of students in the analysis (both groups together).", ai: "The analyzed sample size across all conditions, not the number of schools." },
  risk_of_bias: { key: "risk_of_bias", label: "Risk of bias", type: "select", options: RISK_OF_BIAS, help: "How much to trust the comparison. Low: assigned by chance, few students missing from the results, groups looked alike at the start. High: groups differed a lot at the start, or many students are missing. Some concerns: in between. Write why in the notes. If unsure, choose Not assessed.", ai: "Only when the paper gives enough to judge (randomization, attrition, baseline equivalence). Otherwise Not assessed." },
  targeting_level: { key: "targeting_level", label: "Who the program was for", type: "select", options: TARGETING_LEVELS, help: "Universal: every student in a class or school. Selective: a group at higher risk because of who they are or where they live. Indicated: students screened and found to already have symptoms or behavior problems.", ai: "Universal for whole classes or schools; Selective for an at-risk group chosen by circumstance; Indicated for students screened for existing symptoms or problems." },
  cultural_adaptation: { key: "cultural_adaptation", label: "Culturally adapted?", type: "select", options: CULTURAL_ADAPTATION, help: "Yes only when the authors describe actual changes made to fit a racial, ethnic, or cultural group: language, examples, values, who delivers it, content. A general claim of being culturally sensitive, with no changes described, is No.", ai: "Yes only if concrete adaptations for a racial, ethnic, or cultural group are described." },
  adaptation_depth: { key: "adaptation_depth", label: "Kind of adaptation", type: "select", options: ADAPTATION_DEPTH, help: "Only if adapted. Surface: language, pictures, names, examples. Deep: values, goals, methods, or the context of the group. Both if the paper describes both.", ai: "Null unless the program was culturally adapted." },
  delivery_agent: { key: "delivery_agent", label: "Who delivered it", type: "select", options: DELIVERY_AGENTS, help: "The person who ran the program with the students. Clinician includes counselors, psychologists, and social workers.", ai: "Who actually ran the sessions with students." },
  dosage_sessions: { key: "dosage_sessions", label: "Number of sessions", type: "number", help: "How many sessions were planned. Leave blank if not reported.", ai: "Planned number of sessions, as a number." },
  dosage_weeks: { key: "dosage_weeks", label: "Length in weeks", type: "number", help: "How many weeks the program was planned to run.", ai: "Planned program length in weeks. Convert months to weeks only if the paper gives months explicitly (4.3 weeks per month) and say so in the quote field." },
  pct_black: { key: "pct_black", label: "% Black", type: "number", help: "Percent of the sample. Type 42 for 42 percent. Count African American as Black.", ai: "Percent of the analyzed sample that is Black or African American, as a number from 0 to 100." },
  pct_latinx: { key: "pct_latinx", label: "% Latinx", type: "number", help: "Percent of the sample. Count Hispanic as Latinx.", ai: "Percent Hispanic or Latinx, as a number from 0 to 100." },
  pct_low_income: { key: "pct_low_income", label: "% lower-income", type: "number", help: "Percent of the sample that is lower-income, usually reported as free or reduced-price lunch.", ai: "Percent lower-income, usually free or reduced-price lunch eligibility, as a number from 0 to 100." },
  single_group_sample: { key: "single_group_sample", label: "Only one group in the study?", type: "bool", help: "Yes when (nearly) all students belong to one group, for example all Black students or all Latinx students. Then no gap can be computed within the study.", ai: "True when the sample is almost entirely one racial, ethnic, or income group (about 90 percent or more)." },
  reporting_level: { key: "reporting_level", label: "Reporting level", type: "select", options: REPORTING_LEVELS, help: "Pick the most detailed one found anywhere in the paper or supplement. Cells: means or counts for each group in both the program and the control group (like the worked example in the guide). Group-specific effects: an effect size for each group. Interaction: a test of whether the program worked differently by group. Composition only: just the percent of students in each group. None: not even that.", ai: "The most detailed group-specific reporting found anywhere in the text: cells per group per arm beats an interaction test, which beats group-specific effects, which beats composition only." },
  measures_validated_by_group: { key: "measures_validated_by_group", label: "Measures checked for each group?", type: "select", options: MEASURE_VALIDATION, help: "Does the paper say the questionnaires or scales were tested and work the same way for each group being compared? Usually in the Measures part of the Method section. Most papers do not say; then choose No or not reported.", ai: "Yes only if measurement invariance or validation across the compared groups is reported." },
};

export const CODING_GROUPS: { title: string; where: string; keys: string[] }[] = [
  { title: "A. About the study", where: "Where to look: the Method section (Design, Participants) and Table 1.", keys: ["study_design", "setting", "age_min", "age_max", "n_total", "risk_of_bias"] },
  { title: "B. About the program", where: "Where to look: the Method section, usually a part called Intervention, Program, or Procedure.", keys: ["targeting_level", "cultural_adaptation", "adaptation_depth", "delivery_agent", "dosage_sessions", "dosage_weeks"] },
  { title: "C. Who was in the sample", where: "Where to look: Table 1 or the Participants paragraph.", keys: ["pct_black", "pct_latinx", "pct_low_income", "single_group_sample"] },
  { title: "D. How the results are reported (most important)", where: "Where to look: the whole Results section, every results table, and any online supplement. This answer says whether there are numbers to copy in the Effect sizes tab.", keys: ["reporting_level", "measures_validated_by_group"] },
];

export const CODING_KEYS = Object.keys(CODING_FIELDS);

// The sentence the value was taken from, and the page it is on.
export type Evidence = { quote: string; page: number | null };
export type EvidenceMap = Record<string, Evidence>;
