import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DALKIA GROUPE eDF - Lighting | PSAB Sites",
    template: "%s | DALKIA GROUPE eDF",
  },
  description:
    "DALKIA GROUPE eDF - Lighting replacement tracking. Building 82, Street Light Poles, Schools. Sites, Light Stock, Daily Replacement Reports A-AG. Offline-ready PWA.",
  applicationName: "DALKIA GROUPE eDF",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DALKIA eDF",
  },
  icons: {
    icon: [
      { url: "/icon-circle-180.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-circle-180.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-circle-180.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-circle-180.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-circle-180.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-circle-180.png"],
  },
  openGraph: {
    title: "DALKIA GROUPE eDF",
    description: "Lighting • PSAB • Schools • Offline Ready",
    type: "website",
    images: ["/icon-circle-180.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f766e",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <SWRegister />
        {children}
      </body>
    </html>
  );
}