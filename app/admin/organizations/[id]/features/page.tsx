import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

/** @deprecated use `/admin/organizations/[id]` (עריכה + פיצ'רים) */
export default async function OrganizationFeaturesRedirect({
  params,
}: PageProps) {
  const { id } = await params;
  redirect(`/admin/organizations/${id}`);
}
