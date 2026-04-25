import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";
import type { PdfStructuredRow } from "@/lib/agreementFormTemplateLayout";

export type TemplateSignedDeclarationPdfProps = {
  paragraphs: string[];
  signatureDataUrl: string;
  signedAt: Date;
  agreementNotes?: string | null;
  structuredRows: PdfStructuredRow[];
  brandName?: string;
  brandTagline?: string;
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Heebo",
    fontSize: 11,
    paddingTop: 52,
    paddingBottom: 56,
    paddingHorizontal: 56,
    direction: "rtl",
    textAlign: "right",
    color: "#111827",
    lineHeight: 1.6,
  },
  header: {
    marginBottom: 14,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1e40af",
    alignItems: "flex-end",
  },
  firmName: {
    fontSize: 11.5,
    fontWeight: 700,
    color: "#1e3a8a",
    marginBottom: 2,
  },
  firmTagline: {
    fontSize: 7,
    color: "#6b7280",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 12,
    marginTop: 4,
    color: "#374151",
  },
  paragraph: {
    marginBottom: 10,
    textAlign: "right",
  },
  agreementNotesBlock: {
    marginTop: 20,
    marginBottom: 4,
    paddingTop: 12,
    alignItems: "flex-end",
  },
  agreementNotesHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1e293b",
    marginBottom: 6,
    textAlign: "right",
  },
  agreementNotesLine: {
    fontSize: 10.5,
    fontWeight: 400,
    color: "#334155",
    marginBottom: 4,
    textAlign: "right",
    lineHeight: 1.5,
  },
  structGridRow: {
    flexDirection: "row",
    width: "100%",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  structCell: {
    paddingHorizontal: 4,
    minWidth: 0,
  },
  structLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 2,
    textAlign: "right",
  },
  structValue: {
    fontSize: 10,
    color: "#111827",
    textAlign: "right",
  },
  signatureSection: {
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    alignItems: "flex-end",
  },
  signatureLabel: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 6,
    color: "#111827",
  },
  signatureImageWrap: {
    alignItems: "flex-end",
    marginBottom: 10,
    maxWidth: "100%",
  },
  signatureImage: {
    width: 132,
    height: 48,
    objectFit: "contain" as const,
  },
  dateLine: {
    marginTop: 4,
    fontSize: 9,
    color: "#4b5563",
  },
});

export function TemplateSignedDeclarationPdfDocument(
  props: TemplateSignedDeclarationPdfProps
): ReactElement {
  const dateStr = new Intl.DateTimeFormat("he-IL", {
    dateStyle: "long",
    timeStyle: undefined,
  }).format(props.signedAt);

  return (
    <Document
      title="הצהרה והסכמה חתומה"
      subject="מסמך משפטי — פורטל לקוח"
      language="he"
      creator="Client CRM"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.firmName}>
            {props.brandName?.trim() || "Client CRM"}
          </Text>
          <Text style={styles.firmTagline}>
            {props.brandTagline?.trim() ||
              "ניהול לקוחות — התקשרות וחתימה דיגיטלית"}
          </Text>
        </View>

        {props.structuredRows.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>פרטים מהטופס</Text>
            {props.structuredRows.map((row, ri) => (
              <View key={ri} style={styles.structGridRow}>
                {row.cells.map((cell, ci) => (
                  <View
                    key={ci}
                    style={[styles.structCell, { flex: cell.colSpan }]}
                  >
                    <Text style={styles.structLabel}>{cell.label}</Text>
                    <Text style={styles.structValue}>{cell.value}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionTitle}>נוסח ההצהרה וההסכמה</Text>

        {props.paragraphs.length === 0 ? (
          <Text style={styles.paragraph}>—</Text>
        ) : (
          props.paragraphs.map((p, i) => (
            <Text key={i} style={styles.paragraph}>
              {p}
            </Text>
          ))
        )}

        {(() => {
          const raw = props.agreementNotes?.trim() ?? "";
          if (!raw) return null;
          const lines = raw
            .split(/\r?\n+/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
          if (lines.length === 0) return null;
          return (
            <View style={styles.agreementNotesBlock}>
              <Text style={styles.agreementNotesHeader}>הערות להסכם:</Text>
              {lines.map((line, i) => (
                <Text key={i} style={styles.agreementNotesLine}>
                  {line}
                </Text>
              ))}
            </View>
          );
        })()}

        <View style={styles.signatureSection} wrap={false}>
          <Text style={styles.signatureLabel}>חתימת הלקוח</Text>
          <View style={styles.signatureImageWrap}>
            <Image src={props.signatureDataUrl} style={styles.signatureImage} />
          </View>
          <Text style={styles.dateLine}>תאריך חתימה: {dateStr}</Text>
        </View>
      </Page>
    </Document>
  );
}
