/**
 * Vercel Cron is supposed to send `Authorization: Bearer ${CRON_SECRET}` when set.
 * Some deployments reported missing headers; allow verified Vercel-Cron user-agent on VERCEL=1.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) return true;

  if (process.env.VERCEL === "1") {
    const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
    if (ua.includes("vercel-cron")) return true;
  }

  return false;
}
