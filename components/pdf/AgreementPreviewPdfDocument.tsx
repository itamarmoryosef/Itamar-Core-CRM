import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

export type AgreementPreviewPdfProps = {
  fullName: string;
  idNumber: string;
  paragraphs: string[];
  /** From `clients.agreement_notes`. Rendered only when non-empty. */
  agreementNotes?: string | null;
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
  clientBox: {
    marginBottom: 18,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  clientLabel: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  clientValue: {
    fontSize: 12,
    fontWeight: 700,
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
  placeholderBox: {
    width: 160,
    height: 56,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#9ca3af",
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderHint: {
    fontSize: 8,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  hintBelow: {
    marginTop: 4,
    fontSize: 9,
    color: "#6b7280",
  },
});

export function AgreementPreviewPdfDocument(
  props: AgreementPreviewPdfProps
): ReactElement {
  return (
    <Document
      title="הסכם — תצוגה לפני חתימה"
      subject="מסמך Word הומר ל־PDF לצורך חתימה"
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

        <View style={styles.clientBox}>
          <View style={{ marginBottom: 10 }}>
            <Text style={styles.clientLabel}>שם מלא</Text>
            <Text style={styles.clientValue}>{props.fullName}</Text>
          </View>
          <View>
            <Text style={styles.clientLabel}>מספר תעודת זהות</Text>
            <Text style={styles.clientValue}>{props.idNumber}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>נוסח ההסכם (מתוך תבנית Word)</Text>

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

        <View style={styles.signatureSection}>
          <Text style={styles.signatureLabel}>חתימת הלקוח</Text>
          <View style={styles.placeholderBox}>
            <Text style={styles.placeholderHint}>
              החתימה תתווסף כאן לאחר שתאשרו במסך למטה
            </Text>
          </View>
          <Text style={styles.hintBelow}>
            מסמך זה הופק אוטומטית מקובץ Word עם נתוניכם.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
