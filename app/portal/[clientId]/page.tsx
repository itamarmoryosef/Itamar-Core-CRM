import { notFound } from "next/navigation";
import { ClientPortal } from "@/components/ClientPortal";
import { resolveClientUuidForPortal } from "@/lib/resolveClientPortalId";

type PageProps = {
  params: Promise<{ clientId: string }>;
};

export default async function PortalClientPage({ params }: PageProps) {
  const { clientId: raw } = await params;
  if (!raw || typeof raw !== "string") notFound();

  const uuid = await resolveClientUuidForPortal(raw);
  if (!uuid) notFound();

  return <ClientPortal clientId={uuid} />;
}
