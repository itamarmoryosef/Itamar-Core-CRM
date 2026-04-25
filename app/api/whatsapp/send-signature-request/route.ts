import { NextResponse } from "next/server";
import { getRouteSessionUser } from "@/lib/supabaseAuthRoute";
import { ensureClientShortId } from "@/lib/ensureClientShortId";
import { pendingSignatureDocuments } from "@/lib/portalSignatureState";
import { supabaseForVerifiedAdminWhatsApp } from "@/lib/supabaseWhatsAppAdmin";
import {
  appendPortalQueryParam,
  whatsappPortalLinkFromShortId,
} from "@/lib/appUrls";
import { isWhatsAppConfigured, sendWhatsAppTextMessage } from "@/lib/whatsappSend";

export const dynamic = "force-dynamic";

function buildSignatureRequestMessage(
  fullName: string,
  portalLink: string
): string {
  const name = fullName.trim() || "לקוח";
  return `שלום ${name}, מצורף הסכם לעיונך וחתימתך. אנא היכנס לקישור וחתום: ${portalLink}`;
}

export async function POST(request: Request) {
  const user = await getRouteSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const clientId = typeof b.clientId === "string" ? b.clientId.trim() : "";
  const rawIds = b.templateIds;
  const templateIds = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")
    : [];
  const previewOnly = b.previewOnly === true;
  const previewPortalBaseUrl =
    typeof b.previewPortalBaseUrl === "string"
      ? b.previewPortalBaseUrl.trim()
      : "";

  if (!clientId) {
    return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  }

  const seen = new Set<string>();
  const uniqueTemplateIds = templateIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  if (!previewOnly && !isWhatsAppConfigured()) {
    return NextResponse.json(
      { error: "WhatsApp bridge not configured" },
      { status: 500 }
    );
  }

  const supabase = supabaseForVerifiedAdminWhatsApp();

  /** מסמכים מהתיק בלבד (ללא תבנית גלובלית) — תואם ל־portal `agreement_source: from_document`. */
  let fromDocumentOnly = false;

  if (uniqueTemplateIds.length === 0) {
    const { data: docRows, error: docErr } = await supabase
      .from("documents")
      .select(
        "id, needs_signature, signature_signed_at, file_url, storage_path, created_at"
      )
      .eq("client_id", clientId);

    if (docErr) {
      return NextResponse.json({ error: docErr.message }, { status: 500 });
    }
    const pending = pendingSignatureDocuments(docRows ?? []);
    if (pending.length === 0) {
      return NextResponse.json(
        {
          error:
            "נא לבחור תבנית הסכם או לסמן מסמך PDF/Word לחתימה בטאב מסמכים.",
        },
        { status: 400 }
      );
    }
    fromDocumentOnly = true;
  } else {
    const { data: templates, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, is_active, storage_path")
      .in("id", uniqueTemplateIds);

    if (tplErr) {
      return NextResponse.json({ error: tplErr.message }, { status: 500 });
    }

    const rows = templates ?? [];
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    for (const id of uniqueTemplateIds) {
      const row = byId.get(id);
      if (!row?.storage_path?.trim()) {
        return NextResponse.json(
          { error: `תבנית לא נמצאה או ללא קובץ: ${id}` },
          { status: 400 }
        );
      }
      if (row.is_active !== true) {
        return NextResponse.json(
          { error: `התבנית "${row.name ?? id}" אינה פעילה` },
          { status: 400 }
        );
      }
    }
  }

  const { data: client, error: fetchErr } = await supabase
    .from("clients")
    .select("id, full_name, phone, short_id")
    .eq("id", clientId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!previewOnly) {
    if (!String((client as { phone?: string | null }).phone ?? "").trim()) {
      return NextResponse.json(
        { error: "Invalid or missing phone number for WhatsApp" },
        { status: 400 }
      );
    }
  }

  const { error: updErr } = await supabase
    .from("clients")
    .update(
      fromDocumentOnly
        ? {
            agreement_request_active: true,
            agreement_source: "from_document",
            agreement_custom_pdf_path: null,
            agreement_custom_pdf_filename: null,
            agreement_template_ids: null,
            agreement_template_sign_index: 0,
            agreement_aux_signed_at: null,
            has_signed: false,
          }
        : {
            agreement_request_active: true,
            agreement_source: "template",
            agreement_custom_pdf_path: null,
            agreement_custom_pdf_filename: null,
            agreement_template_ids: uniqueTemplateIds,
            agreement_template_sign_index: 0,
            agreement_aux_signed_at: null,
            has_signed: false,
          }
    )
    .eq("id", clientId);

  if (updErr) {
    return NextResponse.json(
      {
        error: `עדכון הלקוח נכשל: ${updErr.message}. ודאו שהרצתם את add_agreement_template_selection.sql`,
      },
      { status: 500 }
    );
  }

  const shortId = await ensureClientShortId(supabase, client.id as string);
  if (!shortId) {
    return NextResponse.json(
      { error: "Could not assign portal short link for this client" },
      { status: 500 }
    );
  }

  let portalLink: string;
  try {
    if (previewOnly) {
      const origin = (previewPortalBaseUrl || "http://localhost:3001").replace(
        /\/+$/,
        ""
      );
      const base = `${origin}/portal/${encodeURIComponent(shortId)}`;
      portalLink = appendPortalQueryParam(base, "mode", "sign");
    } else {
      const base = whatsappPortalLinkFromShortId(shortId);
      portalLink = appendPortalQueryParam(base, "mode", "sign");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid portal short link" },
      { status: 500 }
    );
  }

  if (previewOnly) {
    return NextResponse.json({
      ok: true,
      previewOnly: true,
      portalLink,
    });
  }

  const message = buildSignatureRequestMessage(
    client.full_name as string,
    portalLink
  );

  const ok = await sendWhatsAppTextMessage({
    phone: (client as { phone?: string | null }).phone as string,
    text: message,
    logLabel: "whatsapp/send-signature-request",
    logMeta: { clientId },
  });

  if (!ok) {
    return NextResponse.json(
      {
        error:
          "שליחת WhatsApp נכשלה. בדקו ששירות ה-Bridge (Baileys) פועל ומשתני WHATSAPP_SERVICE_URL / TOKEN בשרת.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
