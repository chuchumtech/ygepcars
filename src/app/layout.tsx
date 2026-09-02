import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "YGEP Car Rental",
    template: "%s · YGEP Car Rental",
  },
  description:
    "Reserve a yeshiva car online. Check availability, get an instant estimate, and send your request to the office.",
};

export const viewport: Viewport = {
  themeColor: "#213a6d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
