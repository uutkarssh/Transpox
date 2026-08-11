import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Transpox",
  description: "Road pothole detection and ride mapping",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
