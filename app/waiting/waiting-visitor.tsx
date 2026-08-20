"use client";

import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./waiting.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DEVICE_TOKEN_KEY = "mononoke-waiting-device-token";

type Locale = "jp" | "en";
type TicketStatus = "waiting" | "called" | "redeemed" | "expired" | "cancelled";

type Ticket = {
  ticketNumber: number;
  status: TicketStatus;
  issuedAt: string;
  scheduledAt: string;
  calledAt: string | null;
  callWindowEndsAt: string | null;
  redeemedAt: string | null;
};

type Copy = {
  title: string;
  ticketName: string;
  numberSuffix: string;
  waitNow: (minutes: number) => string;
  issue: string;
  issuing: string;
  issueStopped: string;
  issueStoppedDetail: string;
  connectionError: string;
  soldOut: string;
  noteCall: string;
  noteReturn: string;
  noteStorage: string;
  remaining: string;
  minutes: string;
  soon: string;
  arriveAt: (time: string) => string;
  called: string;
  calledDetail: string;
  showAtReception: string;
  windowEnds: (time: string) => string;
  redeemed: string;
  redeemedDetail: string;
  expired: string;
  expiredDetail: string;
  cancelled: string;
  retry: string;
  switchLabel: string;
  switchHref: string;
  switchText: string;
};

const COPY: Record<Locale, Copy> = {
  jp: {
    title: "整理券",
    ticketName: "整理券",
    numberSuffix: "番",
    waitNow: (minutes) => `ただいま ${minutes}分 待ち`,
    issue: "発行する",
    issuing: "発行中…",
    issueStopped: "現在、整理券は発行していません",
    issueStoppedDetail: "混雑時のみ整理券を発行します。通常時はそのまま4階 HR2-2へお越しください。",
    connectionError: "整理券の情報を読み込めませんでした。通信状態を確認して、もう一度お試しください。",
    soldOut: "本日の整理券は発行上限に達しました。受付スタッフへお声がけください。",
    noteCall: "番号でお呼びします。",
    noteReturn: "呼び出し後15分以内に、4階 HR2-2までお戻りください。",
    noteStorage: "ブラウザのCookie・サイトデータなどを削除すると、発行した番号を表示できなくなる場合があります。教室到着後に削除してください。",
    remaining: "残り",
    minutes: "分",
    soon: "まもなく",
    arriveAt: (time) => `${time} にお越しください`,
    called: "ただいま呼び出し中",
    calledDetail: "4階 HR2-2の受付へお越しください。",
    showAtReception: "受付に提示してください",
    windowEnds: (time) => `${time}までにお越しください`,
    redeemed: "受付済みです",
    redeemedDetail: "受付スタッフの案内に従ってお進みください。",
    expired: "受付時間を過ぎました",
    expiredDetail: "4階 HR2-2の受付スタッフへお声がけください。",
    cancelled: "この整理券は利用できません",
    retry: "再読み込み",
    switchLabel: "English page",
    switchHref: "/waiting/en/",
    switchText: "English",
  },
  en: {
    title: "Timed Entry",
    ticketName: "Ticket",
    numberSuffix: "",
    waitNow: (minutes) => `Current wait: about ${minutes} min`,
    issue: "Get a ticket",
    issuing: "Issuing…",
    issueStopped: "Tickets are not being issued now",
    issueStoppedDetail: "Timed tickets are used only when it is crowded. You may go directly to HR 2-2 on the 4th floor.",
    connectionError: "Ticket information could not be loaded. Check your connection and try again.",
    soldOut: "Today's ticket limit has been reached. Please ask a reception staff member.",
    noteCall: "We will call your ticket number.",
    noteReturn: "Please return to HR 2-2 on the 4th floor within 15 minutes after your number is called.",
    noteStorage: "Deleting this browser's cookies or site data may remove your ticket from this device. Please wait until after reception.",
    remaining: "Approx.",
    minutes: "min",
    soon: "Soon",
    arriveAt: (time) => `Please arrive at ${time}`,
    called: "Now calling your number",
    calledDetail: "Please come to reception at HR 2-2 on the 4th floor.",
    showAtReception: "Show this code at reception",
    windowEnds: (time) => `Please arrive by ${time}`,
    redeemed: "Checked in",
    redeemedDetail: "Please follow the reception staff's directions.",
    expired: "Your call window has ended",
    expiredDetail: "Please speak to a reception staff member at HR 2-2.",
    cancelled: "This ticket is no longer valid",
    retry: "Reload",
    switchLabel: "日本語ページ",
    switchHref: "/waiting/jp/",
    switchText: "日本語",
  },
};

type WaitingVisitorProps = {
  locale: Locale;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function WaitingVisitor({
  locale,
  supabaseUrl,
  supabasePublishableKey,
}: WaitingVisitorProps) {
  const copy = COPY[locale];
  const client = useMemo(
    () =>
      supabaseUrl && supabasePublishableKey
        ? createClient(supabaseUrl, supabasePublishableKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
        : null,
    [supabasePublishableKey, supabaseUrl],
  );
  const [deviceToken, setDeviceToken] = useState("");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [waitMinutes, setWaitMinutes] = useState(60);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [issueError, setIssueError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [qrUrl, setQrUrl] = useState("");

  const loadStatus = useCallback(
    async (token: string, quiet = false) => {
      if (!client) {
        setPhase("error");
        return;
      }
      if (!quiet) setPhase("loading");
      const { data, error } = await client.rpc("waiting_ticket_status", {
        p_device_token: token,
      });
      if (error || !data?.ok) {
        if (!quiet) setPhase("error");
        return;
      }
      setEnabled(Boolean(data.enabled));
      setWaitMinutes(Number(data.estimated_wait_minutes ?? 60));
      setTicket(data.has_ticket ? ticketFromResponse(data) : null);
      setPhase("ready");
    },
    [client],
  );

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "ja";
    const initialLoad = window.setTimeout(() => {
      const token = getOrCreateDeviceToken();
      setDeviceToken(token);
      void loadStatus(token);
    }, 0);
    return () => {
      window.clearTimeout(initialLoad);
      document.documentElement.lang = "ja";
    };
  }, [loadStatus, locale]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!deviceToken || !client || phase !== "ready") return;
    const poll = window.setInterval(() => {
      void loadStatus(deviceToken, true);
    }, ticket ? 8000 : 20000);
    return () => window.clearInterval(poll);
  }, [client, deviceToken, loadStatus, phase, ticket]);

  useEffect(() => {
    if (!deviceToken || ticket?.status !== "called") return;
    let active = true;
    void QRCode.toDataURL(`mononoke-waiting:v1:${deviceToken}`, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [deviceToken, ticket?.status]);

  const issueTicket = async () => {
    if (!client || !deviceToken) return;
    setIssuing(true);
    setIssueError("");
    const { data, error } = await client.rpc("waiting_issue_ticket", {
      p_device_token: deviceToken,
    });
    setIssuing(false);
    if (error || !data?.ok) {
      if (data?.reason === "disabled") {
        setEnabled(false);
        setIssueError("");
      } else {
        setIssueError(data?.reason === "sold_out" ? copy.soldOut : copy.connectionError);
      }
      return;
    }
    setTicket(ticketFromResponse(data));
  };

  return (
    <main
      className={`${styles.waitingPage} waitingViewport`}
      lang={locale === "en" ? "en" : "ja"}
    >
      <BrandHeader />
      <Link
        className={styles.languageSwitch}
        href={copy.switchHref}
        aria-label={copy.switchLabel}
      >
        {copy.switchText}
      </Link>

      {phase === "loading" && <LoadingState label={locale === "jp" ? "読み込み中…" : "Loading…"} />}

      {phase === "error" && (
        <StatusCard
          title={copy.connectionError}
          actionLabel={copy.retry}
          onAction={() => deviceToken && void loadStatus(deviceToken)}
        />
      )}

      {phase === "ready" && ticket && (
        <TicketView
          copy={copy}
          locale={locale}
          ticket={ticket}
          now={now}
          qrUrl={qrUrl}
        />
      )}

      {phase === "ready" && !ticket && enabled && (
        <IssueView
          copy={copy}
          waitMinutes={waitMinutes}
          issuing={issuing}
          issueError={issueError}
          onIssue={() => void issueTicket()}
        />
      )}

      {phase === "ready" && !ticket && !enabled && (
        <StatusCard
          title={copy.issueStopped}
          detail={copy.issueStoppedDetail}
        />
      )}
    </main>
  );
}

function BrandHeader() {
  return (
    <header className={styles.brandHeader}>
      <p>もののけの鍵</p>
      <Image
        src={`${BASE_PATH}/assets/mononoke-no-kagi.png`}
        alt=""
        width={144}
        height={144}
        priority
        unoptimized
      />
    </header>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.loadingState} role="status">
      <span />
      <p>{label}</p>
    </div>
  );
}

function IssueView({
  copy,
  waitMinutes,
  issuing,
  issueError,
  onIssue,
}: {
  copy: Copy;
  waitMinutes: number;
  issuing: boolean;
  issueError: string;
  onIssue: () => void;
}) {
  return (
    <section className={styles.issueView} aria-labelledby="waiting-title">
      <h1 id="waiting-title">{copy.title}</h1>
      <div className={styles.waitBubble}>{copy.waitNow(waitMinutes)}</div>
      <button
        className={styles.issueButton}
        type="button"
        disabled={issuing}
        onClick={onIssue}
      >
        {issuing ? copy.issuing : copy.issue}
      </button>
      {issueError && <p className={styles.errorText} role="alert">{issueError}</p>}
      <ul className={styles.notes}>
        <li>{copy.noteCall}</li>
        <li>{copy.noteReturn}</li>
        <li>{copy.noteStorage}</li>
      </ul>
    </section>
  );
}

function TicketView({
  copy,
  locale,
  ticket,
  now,
  qrUrl,
}: {
  copy: Copy;
  locale: Locale;
  ticket: Ticket;
  now: number;
  qrUrl: string;
}) {
  if (ticket.status === "called") {
    return (
      <CalledView copy={copy} locale={locale} ticket={ticket} qrUrl={qrUrl} />
    );
  }

  if (ticket.status === "redeemed") {
    return <StatusCard number={ticket.ticketNumber} title={copy.redeemed} detail={copy.redeemedDetail} />;
  }

  if (ticket.status === "expired") {
    return <StatusCard number={ticket.ticketNumber} title={copy.expired} detail={copy.expiredDetail} tone="warning" />;
  }

  if (ticket.status === "cancelled") {
    return <StatusCard number={ticket.ticketNumber} title={copy.cancelled} tone="warning" />;
  }

  const scheduledTime = formatTime(ticket.scheduledAt, locale);
  const remaining = Math.max(0, Math.ceil((Date.parse(ticket.scheduledAt) - now) / 60000));
  const urgent = remaining <= 10;

  return (
    <section className={styles.ticketView} aria-labelledby="ticket-number">
      <TicketNumber id="ticket-number" copy={copy} number={ticket.ticketNumber} />
      <p className={styles.remainingLabel}>{copy.remaining}</p>
      <div
        className={`${styles.countdownCircle} ${urgent ? styles.urgent : ""}`}
        aria-live="polite"
      >
        <strong>{remaining > 0 ? remaining : copy.soon}</strong>
        {remaining > 0 && <span>{copy.minutes}</span>}
      </div>
      <span className={styles.downArrow} aria-hidden="true" />
      <p className={styles.arrivalTime}>
        <strong>{scheduledTime}</strong>
        <span>{copy.arriveAt(scheduledTime).replace(scheduledTime, "").trim()}</span>
      </p>
      <p className={styles.ticketHint}>{copy.noteCall}</p>
    </section>
  );
}

function CalledView({
  copy,
  locale,
  ticket,
  qrUrl,
}: {
  copy: Copy;
  locale: Locale;
  ticket: Ticket;
  qrUrl: string;
}) {
  const deadline = ticket.callWindowEndsAt
    ? formatTime(ticket.callWindowEndsAt, locale)
    : "";

  return (
    <section className={styles.calledView} aria-labelledby="called-title">
      <TicketNumber copy={copy} number={ticket.ticketNumber} />
      <h1 id="called-title">{copy.called}</h1>
      <p>{copy.calledDetail}</p>
      <span className={styles.downArrow} aria-hidden="true" />
      <div className={styles.qrFrame}>
        {qrUrl ? (
          <Image
            src={qrUrl}
            alt={locale === "jp" ? "受付確認用QRコード" : "Reception QR code"}
            width={720}
            height={720}
            unoptimized
          />
        ) : (
          <span>{locale === "jp" ? "QRコードを作成中…" : "Preparing QR code…"}</span>
        )}
      </div>
      <strong className={styles.showQrText}>{copy.showAtReception}</strong>
      {deadline && <p className={styles.deadline}>{copy.windowEnds(deadline)}</p>}
    </section>
  );
}

function TicketNumber({
  copy,
  number,
  id,
}: {
  copy: Copy;
  number: number;
  id?: string;
}) {
  return (
    <div id={id} className={styles.ticketNumber} aria-label={`${copy.ticketName} ${number}`}>
      <span>{copy.ticketName}</span>
      <strong>{number}</strong>
      {copy.numberSuffix && <span>{copy.numberSuffix}</span>}
    </div>
  );
}

function StatusCard({
  number,
  title,
  detail,
  tone = "default",
  actionLabel,
  onAction,
}: {
  number?: number;
  title: string;
  detail?: string;
  tone?: "default" | "warning";
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className={`${styles.statusCard} ${tone === "warning" ? styles.warningCard : ""}`}>
      {number !== undefined && <strong className={styles.statusNumber}>{number}</strong>}
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction}>{actionLabel}</button>
      )}
    </section>
  );
}

function ticketFromResponse(data: Record<string, unknown>): Ticket {
  return {
    ticketNumber: Number(data.ticket_number),
    status: String(data.status ?? "waiting") as TicketStatus,
    issuedAt: String(data.issued_at ?? ""),
    scheduledAt: String(data.scheduled_at ?? ""),
    calledAt: data.called_at ? String(data.called_at) : null,
    callWindowEndsAt: data.call_window_ends_at ? String(data.call_window_ends_at) : null,
    redeemedAt: data.redeemed_at ? String(data.redeemed_at) : null,
  };
}

function getOrCreateDeviceToken() {
  const existing = window.localStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  window.localStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "jp" ? "ja-JP" : "en-US", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
