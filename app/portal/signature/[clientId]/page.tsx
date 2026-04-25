import { notFound, redirect } from "next/navigation";
import { resolveClientUuidForPortal } from "@/lib/resolveClientPortalId";

type PageProps = {
  params: Promise<{ clientId: string }>;
};

/** Legacy URL — redirects to canonical `/portal/[clientId]?mode=sign`. */
export default async function LegacySignaturePortalPage({ params }: PageProps) {
  const { clientId: raw } = await params;
  if (!raw || typeof raw !== "string") notFound();

  const uuid = await resolveClientUuidForPortal(raw);
  if (!uuid) notFound();

  redirect(`/portal/${raw}?mode=sign`);
}
