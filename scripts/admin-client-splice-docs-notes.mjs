import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "../app/admin/clients/[clientId]/page.tsx");
let t = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const slotRe = /<ADMIN_CLIENT_DOCS_SLOT\s*\/>/;
if (!slotRe.test(t)) throw new Error("docs slot missing");

const docsStart = t.indexOf('aria-labelledby="docs-h"');
if (docsStart < 0) throw new Error("docs-h not found");
const d0 = t.lastIndexOf("      <section", docsStart);
const d1 = t.indexOf("      </section>", d0) + "      </section>".length;
let docsBlock = t.slice(d0, d1);
const afterDocs = t.slice(d1);
t = t.slice(0, d0) + afterDocs;

docsBlock = docsBlock.replace("מסמכים", "מסמכים וחתימות", 1);
docsBlock = docsBlock.replace(
  'id="docs-h"\n          className="text-start text-base font-semibold text-neutral-900 dark:text-neutral-100"',
  'id="docs-h"\n          className="text-start text-base font-semibold text-slate-800 dark:text-slate-100"'
);

t = t.replace(slotRe, docsBlock);

const endMarker = "        </div>\n      </div>\n    </div>\n  );\n}";
const endIdx = t.lastIndexOf(endMarker);
if (endIdx < 0) {
  console.error("tail", JSON.stringify(t.slice(t.length - 350)));
  throw new Error("end marker not found");
}
const before = t.slice(0, endIdx);
const remindersClose = before.lastIndexOf("      </section>");
if (remindersClose < 0) throw new Error("no section close");
const afterSection = before.slice(remindersClose + "      </section>".length);
t =
  before.slice(0, remindersClose + "      </section>".length) +
  "\n          </div>\n        </>\n      )}\n    </div>\n  );\n}";

fs.writeFileSync(p, t);
console.log("ok");
