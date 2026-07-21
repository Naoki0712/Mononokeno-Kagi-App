import { KioskApp } from "./kiosk-app";

export default function HomePage() {
  return (
    <KioskApp
      supabaseUrl={process.env.SUPABASE_URL ?? ""}
      supabasePublishableKey={process.env.SUPABASE_PUBLISHABLE_KEY ?? ""}
    />
  );
}
