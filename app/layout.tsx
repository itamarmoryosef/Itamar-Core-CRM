import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { siteBaseUrl } from "@/lib/appUrls";
import { businessName, businessTagline } from "@/lib/branding";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(`${siteBaseUrl()}/`),
  title: `פורטל לקוח | ${businessName()}`,
  description: businessTagline(),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
