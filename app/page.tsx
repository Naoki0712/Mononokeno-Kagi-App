import { KioskApp } from "./kiosk-app";

export default function HomePage() {
  return (
    <KioskApp
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      supabasePublishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
    />
  );
}
