import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "pack-trace",
    template: "%s | pack-trace",
  },
  description:
    "Hedera-backed GS1 traceability for pharmaceutical packs across manufacturing, distribution, and dispensing.",
  openGraph: {
    title: "pack-trace",
    description:
      "Hedera-backed GS1 traceability for pharmaceutical packs across manufacturing, distribution, and dispensing.",
    url: defaultUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "pack-trace",
    description:
      "Hedera-backed GS1 traceability for pharmaceutical packs across manufacturing, distribution, and dispensing.",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
