import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "17 Labs Official",
  description: "Portfolio strategy and reality tracker"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
