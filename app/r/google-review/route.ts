import { NextResponse } from "next/server";
import { getLicenseGrantedReviewRedirectTarget } from "@/lib/licenseGrantedReviewWhatsApp";

export const dynamic = "force-dynamic";

/** Short public URL for WhatsApp; forwards to Google reviews (or `LICENSE_GRANTED_REVIEW_URL`). */
export function GET() {
  return NextResponse.redirect(getLicenseGrantedReviewRedirectTarget(), 307);
}
