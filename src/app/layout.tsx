import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Same typeface as the canteen and dinner apps, so the yeshiva's tools look
// like one family.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "YGEP Car Rental",
    template: "%s · YGEP Car Rental",
  },
  description:
    "Reserve a yeshiva car. Check availability, get an estimate, and send your request to the office.",
};

export const viewport: Viewport = {
  themeColor: "#517188",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
