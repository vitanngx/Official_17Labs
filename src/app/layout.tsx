import type { Metadata } from "next";
import "./globals.css";
import I18nWrapper from "@/components/I18nWrapper";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://17labs.app";

export const metadata: Metadata = {
  title: {
    default: "17 Labs — Portfolio Optimization & Reality Tracker",
    template: "%s | 17 Labs",
  },
  description:
    "Optimize your investment portfolio using Modern Portfolio Theory. " +
    "Find the best risk-adjusted asset allocation with scipy-based optimization, " +
    "then track your real performance in real-time.",
  keywords: [
    "portfolio optimization",
    "efficient frontier",
    "modern portfolio theory",
    "asset allocation",
    "investment tracker",
    "sharpe ratio",
    "markowitz",
    "portfolio tracker",
    "scipy optimization",
    "risk management",
  ],
  authors: [{ name: "17 Labs" }],
  creator: "17 Labs",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "17 Labs",
    title: "17 Labs — Portfolio Optimization & Reality Tracker",
    description:
      "Find your optimal asset allocation with Markowitz optimization. " +
      "Track real portfolio performance and rebalance with confidence.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "17 Labs — Portfolio Optimization Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "17 Labs — Portfolio Optimization & Reality Tracker",
    description: "Optimize your portfolio like a quant. Free & open.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <I18nWrapper>{children}</I18nWrapper>
      </body>
    </html>
  );
}

