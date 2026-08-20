import type { Metadata } from "next";
import { WaitingVisitor } from "../waiting-visitor";

export const metadata: Metadata = {
  title: "Timed Entry Ticket | Mononoke no Kagi",
  description: "Get a timed entry ticket and check your estimated call time.",
};

export default function EnglishWaitingPage() {
  return (
    <WaitingVisitor
      locale="en"
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
