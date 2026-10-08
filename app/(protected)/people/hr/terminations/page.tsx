import { redirect } from "next/navigation";

export default function TerminationsPage() {
  redirect("/people/hr/probation-exit?tab=termination");
}
