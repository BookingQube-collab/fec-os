import { redirect } from "next/navigation";

export default function PeopleTrainingPage() {
  redirect("/people?tab=training");
}
