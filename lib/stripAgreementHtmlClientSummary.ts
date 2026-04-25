/**
 * Removes the typical Word/mammoth "client details" block (שם מלא + תעודת זהות)
 * from agreement HTML so the portal can show the document without that gray summary box.
 * Safe no-op if the markers are absent.
 */
export function stripClientIdentitySummaryFromAgreementHtml(html: string): string {
  if (!html.trim()) return html;
  if (
    !html.includes("שם מלא") ||
    (!html.includes("מספר תעודת זהות") && !html.includes("תעודת זהות"))
  ) {
    return html;
  }

  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }

  const wrapped = `<div id="__agreement_strip_root">${html}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const root = doc.getElementById("__agreement_strip_root");
  if (!root) return html;

  function depth(el: Element): number {
    let d = 0;
    let p: Element | null = el;
    while (p && p !== root) {
      d += 1;
      p = p.parentElement;
    }
    return d;
  }

  let guard = 0;
  while (guard++ < 8) {
    let best: Element | null = null;
    let bestDepth = -1;
    for (const el of root.querySelectorAll("*")) {
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (
        !text.includes("שם מלא") ||
        (!text.includes("מספר תעודת זהות") && !text.includes("תעודת זהות"))
      ) {
        continue;
      }
      if (text.length > 1400) continue;
      const d = depth(el);
      if (d > bestDepth) {
        bestDepth = d;
        best = el;
      }
    }
    if (!best) break;

    const table = best.closest("table");
    if (table && root.contains(table)) {
      table.remove();
      continue;
    }
    best.remove();
  }

  // Gray summary tables: short text with name + ID labels (Word/mammoth variants).
  for (const table of Array.from(root.querySelectorAll("table"))) {
    const text = (table.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 900) continue;
    const hasName =
      /שם\s*מלא|שם\s*:/i.test(text) || /שם\s+הלקוח/i.test(text);
    const hasId =
      /ת\.?\s*ז\.?|תעודת\s*זהות|מספר\s*זהות|מספר\s*תעודת\s*זהות/i.test(
        text
      );
    if (hasName && hasId) {
      table.remove();
    }
  }

  return root.innerHTML;
}
