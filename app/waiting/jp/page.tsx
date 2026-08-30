import type { Metadata } from "next";
import { WaitingVisitor } from "../waiting-visitor";

export const metadata: Metadata = {
  title: "整理券 | もののけの鍵",
  description: "もののけの鍵の整理券を発行し、残り時間と予定時刻を確認できます。",
};

export default function JapaneseWaitingPage() {
  return (
    <WaitingVisitor
      locale="jp"
      supabaseUrl={
        process.env.NEXT_PUBLIC_SUPABASE_PROXY_URL ??
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
