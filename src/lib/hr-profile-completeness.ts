/**
 * Missing-data checklist for one employee record.
 * It does not score suitability and does not read protected characteristics
 * (gender, nationality, date of birth, age, religion, marital status).
 */
export const PROFILE_GAP_KEYS = [
  "emergency_contact",
  "manager",
  "hire_date",
  "contract",
  "photo",
  "qid",
  "skills",
  "education",
] as const;

export type ProfileGapKey = (typeof PROFILE_GAP_KEYS)[number];

export function employeeProfileGaps(input: {
  emergencyContact: boolean;
  manager: boolean;
  hireDate: boolean;
  contract: boolean;
  photo: boolean;
  qidOnFile: boolean;
  skills: boolean;
  educationVisible: boolean;
  educationCount: number;
}): ProfileGapKey[] {
  const missing: ProfileGapKey[] = [];
  if (!input.emergencyContact) missing.push("emergency_contact");
  if (!input.manager) missing.push("manager");
  if (!input.hireDate) missing.push("hire_date");
  if (!input.contract) missing.push("contract");
  if (!input.photo) missing.push("photo");
  if (!input.qidOnFile) missing.push("qid");
  if (!input.skills) missing.push("skills");
  if (input.educationVisible && input.educationCount === 0) missing.push("education");
  return missing;
}

export const EDUCATION_DOC_TYPES = new Set(["educational_certificate", "mofa_attested_certificate"]);
