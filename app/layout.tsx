import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "もののけの鍵",
  description: "文化祭企画『もののけの鍵』の運営情報を確認するアプリです。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: `${basePath}/assets/mononoke-no-kagi.png`,
    shortcut: `${basePath}/assets/mononoke-no-kagi.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      style={{ "--mononoke-logo": `url("${basePath}/assets/mononoke-no-kagi.png")` } as CSSProperties}
    >
      <body>{children}</body>
    </html>
  );
}
