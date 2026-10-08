import { redirect } from "next/navigation";

export default function ResignationsPage() {
  redirect("/people/hr/probation-exit?tab=resignation");
}
