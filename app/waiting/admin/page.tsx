import type { Metadata } from "next";
import { WaitingAdmin } from "../waiting-admin";

export const metadata: Metadata = {
  title: "整理券管理 | もののけの鍵",
  description: "もののけの鍵の整理券運用画面です。",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WaitingAdminPage() {
  return (
    <WaitingAdmin
      supabaseUrl={
        process.env.SUPABASE_URL ??
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
        ""
      }
      supabasePublishableKey={
        process.env.SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        ""
      }
    />
  );
}
