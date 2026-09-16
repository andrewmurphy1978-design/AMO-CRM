import type { Metadata } from "next";
import { Space_Grotesk, Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Same badge asset used throughout the sidebar/headers.
const AMO_BADGE_URL = "https://d1yei2z3i6k35z.cloudfront.net/18410699/6a596c0abdbde8.23945126_AMOBadgeTransparent.png";

export const metadata: Metadata = {
  title: "Andrew Murphy Online CRM",
  description: "Contacts, projects, and tasks for Andrew Murphy Online.",
  icons: {
    icon: AMO_BADGE_URL,
    shortcut: AMO_BADGE_URL,
    apple: AMO_BADGE_URL,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
