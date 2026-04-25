/**
 * Converts agreement HTML (from mammoth) into plain-text paragraphs for PDF `Text` nodes.
 * Browser-only — uses DOMParser.
 */
export function agreementHtmlToParagraphs(html: string): string[] {
  if (typeof document === "undefined") {
    return [];
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = doc.body.querySelectorAll("p, h1, h2, h3, h4, li");

  const normalize = (s: string) =>
    s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  const RLM = "\u200F";
  const out: string[] = [];
  if (blocks.length > 0) {
    blocks.forEach((el) => {
      const base = normalize(el.textContent ?? "");
      if (!base) return;

      let t = base;
      if (el.tagName === "LI") {
        const parentTag = el.parentElement?.tagName ?? "";
        if (parentTag === "OL" && el.parentElement) {
          const liSiblings = Array.from(el.parentElement.children).filter(
            (c) => c.tagName === "LI"
          );
          const idx = liSiblings.indexOf(el) + 1;
          if (idx > 0) t = `${idx}. ${base}`;
        } else if (parentTag === "UL") {
          t = `• ${base}`;
        }
      }

      // Force RTL visual order for mixed Hebrew/numbered lines in PDF rendering.
      out.push(`${RLM}${t}`);
    });
  }

  if (out.length === 0) {
    const t = normalize(doc.body.textContent ?? "");
    if (t) out.push(t);
  }

  return out;
}
