"use client";

import Image from "next/image";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScheduleScreen } from "./schedule-screen";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Screen = "home" | "schedule" | "video" | "map";

type KioskAppProps = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function KioskApp({
  supabaseUrl,
  supabasePublishableKey,
}: KioskAppProps) {
  const client = useMemo(
    () =>
      supabaseUrl && supabasePublishableKey
        ? createClient(supabaseUrl, supabasePublishableKey, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          })
        : null,
    [supabasePublishableKey, supabaseUrl],
  );
  const [screen, setScreen] = useState<Screen>("home");
  const [portalAccess, setPortalAccess] = useState<"loading" | "classmate" | "none">("loading");
  const [classmateToken, setClassmateToken] = useState("");
  const [classmateId, setClassmateId] = useState("");

  useEffect(() => {
    if (!client) {
      const unavailable = window.setTimeout(() => setPortalAccess("none"), 0);
      return () => window.clearTimeout(unavailable);
    }

    let active = true;
    const restoreClassmate = async () => {
      const token = window.localStorage.getItem("mononoke-classmate-session");
      if (!token) {
        if (active) {
          setClassmateToken("");
          setClassmateId("");
          setPortalAccess("none");
        }
        return;
      }
      const { data } = await client.rpc("classmate_session", { p_token: token });
      if (active) {
        if (data?.ok) {
          setClassmateToken(token);
          setClassmateId(String(data.student_id ?? ""));
          setPortalAccess("classmate");
        }
        else {
          window.localStorage.removeItem("mononoke-classmate-session");
          setClassmateToken("");
          setClassmateId("");
          setPortalAccess("none");
        }
      }
    };

    void restoreClassmate();
    return () => {
      active = false;
    };
  }, [client]);

  const logoutPortal = async () => {
    window.localStorage.removeItem("mononoke-classmate-session");
    setClassmateToken("");
    setClassmateId("");
    setScreen("home");
    setPortalAccess("none");
  };

  useEffect(() => {
    const returnHome = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        setScreen("home");
      }
    };
    window.addEventListener("keydown", returnHome);
    return () => window.removeEventListener("keydown", returnHome);
  }, []);

  return (
    <main className={`kioskApp screen-${screen}`}>
      <Watermark />

      <TimeChrome />

      {portalAccess === "loading" && <div className="portalGateLoading">読み込み中</div>}

      {portalAccess === "none" && client && (
        <ClassmateLogin
          client={client}
          onSuccess={(token, studentId) => {
            setClassmateToken(token);
            setClassmateId(studentId);
            setPortalAccess("classmate");
          }}
        />
      )}

      {portalAccess !== "loading" && portalAccess !== "none" && screen === "home" && (
        <HomeScreen onNavigate={setScreen} onLogout={() => void logoutPortal()} />
      )}

      {portalAccess !== "loading" && portalAccess !== "none" && screen === "schedule" && (
        <ScheduleScreen
          onBack={() => setScreen("home")}
          supabaseUrl={supabaseUrl}
          supabasePublishableKey={supabasePublishableKey}
          classmateToken={classmateToken}
          classmateId={classmateId}
        />
      )}

      {portalAccess !== "loading" && portalAccess !== "none" && screen === "video" && (
        <section className="subScreen videoScreen" aria-labelledby="video-title">
          <BackTitle
            id="video-title"
            title="映像を流す"
            onBack={() => setScreen("home")}
          />
        </section>
      )}

      {portalAccess !== "loading" && portalAccess !== "none" && screen === "map" && (
        <section className="subScreen mapScreen" aria-labelledby="map-title">
          <BackTitle
            id="map-title"
            title="マップを開く"
            onBack={() => setScreen("home")}
          />
        </section>
      )}
    </main>
  );
}

function ClassmateLogin({
  client,
  onSuccess,
}: {
  client: SupabaseClient;
  onSuccess: (token: string, studentId: string) => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: requestError } = await client.rpc("classmate_login", {
      p_student_id: studentId,
      p_password: password,
    });
    if (requestError || !data?.ok || !data.token) {
      setError(data?.message ?? "ログインできませんでした。もう一度お試しください。");
      setLoading(false);
      return;
    }
    window.localStorage.setItem("mononoke-classmate-session", data.token);
    onSuccess(data.token, String(data.student_id ?? studentId));
  };

  return (
    <section className="loginScreen" aria-labelledby="classmate-login-title">
      <h1 id="classmate-login-title">ログイン</h1>
      <form className="loginCard" onSubmit={(event) => void submit(event)}>
        <h2>IDとパスワードを入力してください</h2>
        <label>ID<input value={studentId} onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="username" required /></label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8))}
            autoComplete="current-password"
            autoCapitalize="characters"
            minLength={8}
            maxLength={8}
            pattern="[0-9A-Z]{8}"
            title="数字・英大文字を使った8文字で入力してください"
            required
          />
        </label>
        {error && <p className="loginError" role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "確認中…" : "ログインする"}</button>
      </form>
    </section>
  );
}

function HomeScreen({
  onNavigate,
  onLogout,
}: {
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}) {
  return (
    <section className="homeScreen" aria-label="ホーム">
      <Brand className="homeBrand" />

      <nav className="homeActions" aria-label="機能を選択">
        <button
          type="button"
          className="actionButton primaryAction"
          onClick={() => onNavigate("schedule")}
        >
          スケジュールを確認する
        </button>
        <div className="secondaryActions">
          <button
            type="button"
            className="actionButton secondaryAction"
            onClick={() => onNavigate("video")}
          >
            映像を流す
          </button>
          <button
            type="button"
            className="actionButton secondaryAction"
            onClick={() => onNavigate("map")}
          >
            マップを開く
          </button>
        </div>
      </nav>

      <button
        type="button"
        className="homeLogout"
        onClick={onLogout}
        aria-label="ログアウトしてIDとパスワードの入力画面に戻る"
      >
        <LogOut aria-hidden="true" />
        <span>ログアウト</span>
      </button>
    </section>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`kioskBrand ${className}`}>
      <Image
        className="brandSymbol"
        src={`${BASE_PATH}/assets/mononoke-no-kagi.png`}
        alt=""
        width={1024}
        height={1024}
        priority
        unoptimized
      />
      <div className="kioskBrandCopy">
        <p>もののけの鍵</p>
      </div>
    </div>
  );
}

function Watermark() {
  return (
    <Image
      className="watermark"
      src={`${BASE_PATH}/assets/mononoke-no-kagi.png`}
      alt=""
      width={1024}
      height={1024}
      priority
      unoptimized
      aria-hidden="true"
    />
  );
}

function BackTitle({
  id,
  title,
  onBack,
}: {
  id: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="screenHeader">
      <button type="button" className="backTitle" onClick={onBack}>
        <span className="textBackGlyph" aria-hidden="true">&lt;</span>
        <h1 id={id}>{title}</h1>
      </button>
    </header>
  );
}

function TimeChrome() {
  const now = useClock();
  const date = useMemo(() => {
    if (!now) return "--月--日";
    const parts = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
    }).formatToParts(now);
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    return `${month}月${day}日`;
  }, [now]);

  const time = useMemo(() => {
    if (!now) return "--:--";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  }, [now]);

  return (
    <div className="timeChrome" aria-label="現在の日付と時刻">
      <time dateTime={now?.toISOString()} className="dateDisplay">
        {date}
      </time>
      <time dateTime={now?.toISOString()} className="timeDisplay">
        {time}
      </time>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  return now;
}
