import { KioskApp } from "./kiosk-app";

export default function HomePage() {
  return (
    <KioskApp
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
