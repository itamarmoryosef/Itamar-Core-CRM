import { redirect } from "next/navigation";

/**
 * @deprecated use `/admin/organizations` — single super org + features page.
 */
export default function SuperOrganizationsPageRedirect() {
  redirect("/admin/organizations");
}
