/**
 * יצירת משתמש Supabase Auth + role admin ב-profiles.
 * אין לשמור סיסמא ב-Git. הרצה: node scripts/createAuthUser.mjs [אימייל] [סיסמא-אופציונלית]
 * דורש: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (מ-.env.local או סביבה)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error("חסר NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY (בעיקר .env.local).");
  process.exit(1);
}

const emailArg = process.argv[2]?.trim();
const passArg = process.argv[3];

const defaultEmail = "i0503781924@gmail.com";
const email = emailArg || defaultEmail;

const password =
  passArg && passArg.length >= 8
    ? passArg
    : randomBytes(12).toString("base64url") + "A1!";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: uData, error: uErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (uErr) {
  const wantRetry =
    /registered|exists|already|duplicate/i.test(uErr.message ?? "");
  if (wantRetry) {
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1_000 });
    const byEmail = listData?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (byEmail) {
      const { error: pErr2 } = await admin.from("profiles").upsert(
        { id: byEmail.id, email, role: "admin" },
        { onConflict: "id" }
      );
      if (pErr2) {
        console.error("profiles update:", pErr2.message);
        process.exit(1);
      }
      console.log("המשתמש כבר היה קיים. עודכן ל-admin ב-profiles.");
      console.log("אימייל:", email);
      process.exit(0);
    }
  }
  console.error("יצירת משתמש:", uErr.message);
  process.exit(1);
}

const userId = uData.user?.id;
if (!userId) {
  console.error("אין user id בתשובה.");
  process.exit(1);
}

const { error: pErr } = await admin.from("profiles").upsert(
  {
    id: userId,
    email,
    role: "admin",
  },
  { onConflict: "id" }
);

if (pErr) {
  console.error("שמירה ל-profiles:", pErr.message);
  console.log("Auth user נוצר, אבל admin ב-profiles נכשל — בדקו אם הטבלה exist והרצת profiles_team.sql");
  process.exit(1);
}

console.log("נוצר משתמש + admin.");
console.log("אימייל:", email);
console.log("סיסמא (שמרו במקום בטוח, לא בצ'אט):", password);
console.log("כניסה: /login באתר המקומי או Vercel.");
