import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ClientPortal } from "@/components/ClientPortal";
import { resolveClientUuidForPortal } from "@/lib/resolveClientPortalId";

type PageProps = {
  params: Promise<{ clientId: string }>;
};

function ClientPortalLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-neutral-600 dark:text-neutral-400"
      dir="rtl"
    >
      <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
      <p className="text-start text-base">טוען את פורטל הלקוח…</p>
    </div>
  );
}

export default async function ClientPortalPage({ params }: PageProps) {
  const { clientId: raw } = await params;
  if (!raw || typeof raw !== "string") notFound();

  const uuid = await resolveClientUuidForPortal(raw);
  if (!uuid) notFound();

  return (
    <Suspense fallback={<ClientPortalLoading />}>
      <ClientPortal clientId={uuid} />
    </Suspense>
  );
}
