import { redirect } from "next/navigation";

export default function AdminCallCenterRedirect() {
  redirect("/call-center/settings");
}
