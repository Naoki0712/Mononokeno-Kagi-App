import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "もののけの鍵",
  description: "文化祭企画『もののけの鍵』の運営情報を確認するアプリです。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/assets/mononoke-no-kagi.png",
    shortcut: "/assets/mononoke-no-kagi.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
