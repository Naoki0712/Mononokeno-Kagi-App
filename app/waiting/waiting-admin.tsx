"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import jsQR from "jsqr";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./waiting.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CLASSMATE_SESSION_KEY = "mononoke-classmate-session";

type AdminTicketStatus = "waiting" | "called" | "pending" | "redeemed" | "expired" | "cancelled";

type AdminTicket = {
  ticket_number: number;
  status: AdminTicketStatus;
  issued_at: string;
  scheduled_at: string;
  called_at: string | null;
  redeemed_at: string | null;
  pending_at: string | null;
  manually_issued: boolean;
};

type AdminSnapshot = {
  ok: true;
  admin_student_id: string;
  enabled: boolean;
  estimated_wait_minutes: number;
  waiting_count: number;
  called_count: number;
  redeemed_count: number;
  last_issued_number: number;
  next_waiting_number: number | null;
  tickets: AdminTicket[];
};

type WaitingAdminProps = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function WaitingAdmin({
  supabaseUrl,
  supabasePublishableKey,
}: WaitingAdminProps) {
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
  const [phase, setPhase] = useState<"loading" | "login" | "dashboard" | "forbidden" | "error">("loading");
  const [token, setToken] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftWait, setDraftWait] = useState(60);
  const settingsDirtyRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [consoleScreen, setConsoleScreen] = useState<1 | 2>(2);

  const refresh = useCallback(
    async (sessionToken: string, quiet = false) => {
      if (!client) {
        setPhase("error");
        return;
      }
      if (!quiet) setPhase("loading");
      const { data, error } = await client.rpc("waiting_admin_snapshot", {
        p_classmate_token: sessionToken,
      });
      if (error) {
        setPhase("error");
        return;
      }
      if (!data?.ok) {
        setPhase(data?.reason === "forbidden" ? "forbidden" : "login");
        return;
      }
      const next = data as AdminSnapshot;
      setSnapshot(next);
      if (!settingsDirtyRef.current) {
        setDraftEnabled(Boolean(next.enabled));
        setDraftWait(Number(next.estimated_wait_minutes));
      }
      setPhase("dashboard");
    },
    [client],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      const stored = window.localStorage.getItem(CLASSMATE_SESSION_KEY) ?? "";
      if (!stored) {
        setPhase("login");
        return;
      }
      setToken(stored);
      void refresh(stored);
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  useEffect(() => {
    if (phase !== "dashboard" || !token) return;
    const timer = window.setInterval(() => void refresh(token, true), 10000);
    return () => window.clearInterval(timer);
  }, [phase, refresh, token]);

  useEffect(() => {
    if (phase !== "dashboard") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const moveTicket = async (ticketNumber: number, status: "waiting" | "called" | "pending") => {
    if (!client || !token || busy) return;
    setBusy(`move-${ticketNumber}`);
    setMessage("");
    const { data, error } = await client.rpc("waiting_admin_move_ticket", {
      p_classmate_token: token,
      p_ticket_number: ticketNumber,
      p_status: status,
    });
    setBusy("");
    if (error || !data?.ok) {
      setMessage(data?.reason === "called_slot_occupied" ? "呼び出し中に置ける番号は1つまでです。" : "番号を移動できませんでした。");
      return;
    }
    await refresh(token, true);
  };

  const issueManual = async () => {
    if (!client || !token || busy) return;
    setBusy("manual");
    setMessage("");
    const { data, error } = await client.rpc("waiting_admin_issue_manual", {
      p_classmate_token: token,
    });
    setBusy("");
    if (error || !data?.ok) {
      setMessage("整理券を手動発行できませんでした。");
      return;
    }
    setMessage(`${Number(data.ticket_number)}番を手動で追加しました。`);
    await refresh(token, true);
  };

  const saveSettings = async () => {
    if (!client || !token) return;
    setBusy("settings");
    setMessage("");
    const { data, error } = await client.rpc("waiting_admin_set_queue", {
      p_classmate_token: token,
      p_enabled: draftEnabled,
      p_wait_minutes: draftWait,
    });
    setBusy("");
    if (error || !data?.ok) {
      setMessage("設定を保存できませんでした。");
      return;
    }
    settingsDirtyRef.current = false;
    setMessage(draftEnabled ? "整理券の発行を開始しました。" : "整理券の発行を停止しました。");
    await refresh(token, true);
  };

  const callNext = async () => {
    if (!client || !token) return;
    setBusy("call");
    setMessage("");
    const { data, error } = await client.rpc("waiting_admin_call_next", {
      p_classmate_token: token,
    });
    setBusy("");
    if (error || !data?.ok) {
      setMessage(data?.reason === "empty" ? "呼び出し待ちの整理券はありません。" : "次の番号を呼び出せませんでした。");
      return;
    }
    setMessage(`${Number(data.ticket_number)}番を呼び出しました。`);
    await refresh(token, true);
  };

  const redeemQr = useCallback(
    async (code: string) => {
      if (!client || !token) return;
      setBusy("scan");
      const { data, error } = await client.rpc("waiting_admin_redeem", {
        p_classmate_token: token,
        p_qr_code: code,
      });
      setBusy("");
      if (error || !data?.ok) {
        const number = data?.ticket_number ? `${Number(data.ticket_number)}番：` : "";
        const reasonMessage: Record<string, string> = {
          not_called: "まだ呼び出していません。",
          expired: "受付可能な15分を過ぎています。",
          invalid_qr: "整理券のQRコードではありません。",
          cancelled: "この整理券は利用できません。",
        };
        setMessage(`${number}${reasonMessage[String(data?.reason)] ?? "QRコードを確認できませんでした。"}`);
        return;
      }
      const suffix = data.reason === "already_redeemed" ? "はすでに受付済みです。" : "を受付済みにしました。";
      setMessage(`${Number(data.ticket_number)}番${suffix}`);
      await refresh(token, true);
    },
    [client, refresh, token],
  );

  const logout = () => {
    window.localStorage.removeItem(CLASSMATE_SESSION_KEY);
    setToken("");
    setSnapshot(null);
    setPhase("login");
  };

  return (
    <main className={`${styles.waitingPage} ${styles.adminPage} waitingViewport`}>
      {phase !== "dashboard" && <header className={styles.adminHeader}>
        <div>
          <Image
            src={`${BASE_PATH}/assets/mononoke-no-kagi.png`}
            alt=""
            width={80}
            height={80}
            priority
            unoptimized
          />
          <div>
            <p>もののけの鍵</p>
            <h1>整理券管理</h1>
          </div>
        </div>
        <Link href="/">運営アプリへ戻る</Link>
      </header>}

      {phase === "loading" && <AdminLoading />}
      {phase === "login" && client && (
        <AdminLogin
          client={client}
          onSuccess={(sessionToken) => {
            window.localStorage.setItem(CLASSMATE_SESSION_KEY, sessionToken);
            setToken(sessionToken);
            void refresh(sessionToken);
          }}
        />
      )}
      {phase === "forbidden" && (
        <section className={styles.adminGateCard}>
          <h2>整理券を管理する権限がありません</h2>
          <p>当日の管理担当者のIDでログインしてください。</p>
          <button type="button" onClick={logout}>別のIDでログイン</button>
        </section>
      )}
      {phase === "error" && (
        <section className={styles.adminGateCard}>
          <h2>管理情報を読み込めませんでした</h2>
          <button type="button" onClick={() => token ? void refresh(token) : setPhase("login")}>再読み込み</button>
        </section>
      )}
      {phase === "dashboard" && snapshot && (
        <section className={styles.queueConsole}>
          <div className={styles.consoleTopbar}>
            <time>{formatConsoleDate(now)}</time>
            <time>{formatConsoleClock(now)}</time>
          </div>
          <div className={styles.consoleNav}>
            <Link href="/">‹ 受付のシステムを使う</Link>
            <div className={styles.screenSwitch} aria-label="表示画面の切り替え">
              <button type="button" className={consoleScreen === 1 ? styles.activeScreen : ""} onClick={() => setConsoleScreen(1)} aria-label="来場者側の画面">1</button>
              <button type="button" className={consoleScreen === 2 ? styles.activeScreen : ""} onClick={() => setConsoleScreen(2)} aria-label="受付スタッフ側の画面">2</button>
            </div>
          </div>
          {message && <div className={styles.consoleMessage} role="status">{message}</div>}
          {consoleScreen === 1 ? <VisitorCallBoard tickets={snapshot.tickets} /> : <div className={styles.consoleColumns}>
            <div className={styles.queueBoard}>
              <TicketLane title="保留中" subtitle="Pending" status="pending" tickets={snapshot.tickets} now={now} onMove={moveTicket} />
              <TicketLane title="呼び出し中（1つだけ選択可）" subtitle="Calling" status="called" tickets={snapshot.tickets} now={now} onMove={moveTicket} />
              <div className={styles.waitingHeading}>
                <div><h2>呼び出し前</h2><p>Up next</p></div>
                <button type="button" onClick={() => void issueManual()} disabled={busy === "manual"}>✋ 手動で追加</button>
              </div>
              <TicketLane title="" subtitle="" status="waiting" tickets={snapshot.tickets} now={now} onMove={moveTicket} hideHeading />
            </div>
            <aside className={styles.scriptPlaceholder}>
              <h2>受付用スクリプト</h2>
              <p>後ほど追加します</p>
            </aside>
          </div>}
          <button className={styles.consoleLogout} type="button" onClick={logout}>ID {snapshot.admin_student_id}・ログアウト</button>
        </section>
      )}
    </main>
  );
}

function AdminLogin({
  client,
  onSuccess,
}: {
  client: SupabaseClient;
  onSuccess: (token: string) => void;
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
    setLoading(false);
    if (requestError || !data?.ok || !data.token) {
      setError(data?.message ?? "ログインできませんでした。");
      return;
    }
    onSuccess(String(data.token));
  };

  return (
    <section className={styles.adminGateCard}>
      <p className={styles.eyebrow}>STAFF ONLY</p>
      <h2>管理担当者ログイン</h2>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          ID
          <input
            value={studentId}
            onChange={(event) => setStudentId(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="username"
            required
          />
        </label>
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
            required
          />
        </label>
        {error && <p className={styles.adminError} role="alert">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "確認中…" : "ログイン"}</button>
      </form>
    </section>
  );
}

function TicketLane({
  title,
  subtitle,
  status,
  tickets,
  now,
  onMove,
  hideHeading = false,
}: {
  title: string;
  subtitle: string;
  status: "waiting" | "called" | "pending";
  tickets: AdminTicket[];
  now: number;
  onMove: (ticketNumber: number, status: "waiting" | "called" | "pending") => Promise<void>;
  hideHeading?: boolean;
}) {
  const laneTickets = tickets.filter((ticket) => ticket.status === status);
  return (
    <section
      className={`${styles.ticketLane} ${styles[`lane_${status}`]}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const ticketNumber = Number(event.dataTransfer.getData("text/plain"));
        if (ticketNumber) void onMove(ticketNumber, status);
      }}
      aria-label={`${title || "呼び出し前"}の番号`}
    >
      {!hideHeading && <div className={styles.laneHeading}><h2>{title}</h2><p>{subtitle}</p></div>}
      <div className={styles.ticketStrip}>
        {laneTickets.length === 0 && <span className={styles.emptyLane}>番号なし</span>}
        {laneTickets.map((ticket) => {
          const elapsed = ticket.pending_at ? Math.max(0, now - new Date(ticket.pending_at).getTime()) : 0;
          const overdue = status === "pending" && elapsed >= 15 * 60 * 1000;
          return (
            <button
              type="button"
              draggable
              key={ticket.ticket_number}
              className={`${styles.queueTicket} ${ticket.manually_issued ? styles.manualTicket : ""} ${overdue ? styles.overdueTicket : ""}`}
              onDragStart={(event) => event.dataTransfer.setData("text/plain", String(ticket.ticket_number))}
              title="ドラッグして状態を変更"
            >
              <span>{ticket.manually_issued && <b aria-label="手動発券">✋</b>}{ticket.ticket_number}</span>
              {status === "pending" && <small>{formatElapsed(elapsed)}</small>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function VisitorCallBoard({ tickets }: { tickets: AdminTicket[] }) {
  const called = tickets.find((ticket) => ticket.status === "called");
  const waiting = tickets.filter((ticket) => ticket.status === "waiting").slice(0, 6);
  const pending = tickets.filter((ticket) => ticket.status === "pending").slice(0, 4);
  return (
    <div className={styles.visitorCallBoard}>
      <section className={styles.callingPanel}>
        <h2>呼び出し中</h2>
        <strong>{called?.ticket_number ?? "—"}</strong>
        <p lang="en">Calling</p>
        <div className={styles.receptionArrow}>↑</div>
        <h3>受付へ</h3>
        <p lang="en">Go to the Reception</p>
      </section>
      <div className={styles.callLists}>
        <section><h2>呼び出し前</h2><p lang="en">Up next</p><div>{waiting.map((ticket) => <strong key={ticket.ticket_number}>{ticket.ticket_number}</strong>)}</div></section>
        <section><h2>保留中</h2><p lang="en">Pending</p><div>{pending.map((ticket) => <strong key={ticket.ticket_number}>{ticket.ticket_number}</strong>)}</div></section>
      </div>
    </div>
  );
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatConsoleDate(now: number) {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).formatToParts(now);
  return `${parts.find((part) => part.type === "month")?.value}月${parts.find((part) => part.type === "day")?.value}日`;
}

function formatConsoleClock(now: number) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

function AdminLoading() {
  return (
    <div className={styles.loadingState} role="status">
      <span />
      <p>管理情報を読み込み中…</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TicketTable({ tickets }: { tickets: AdminTicket[] }) {
  const labels: Record<AdminTicketStatus, string> = {
    waiting: "待機中",
    called: "呼出中",
    redeemed: "受付済み",
    expired: "期限切れ",
    cancelled: "取消",
  };

  if (!tickets.length) {
    return <p className={styles.emptyTickets}>本日発行された整理券はありません。</p>;
  }

  return (
    <div className={styles.ticketTableWrap}>
      <table className={styles.ticketTable}>
        <thead>
          <tr>
            <th>番号</th>
            <th>状態</th>
            <th>発行</th>
            <th>予定</th>
            <th>呼出</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticket_number}>
              <td>{ticket.ticket_number}</td>
              <td><span data-status={ticket.status}>{labels[ticket.status]}</span></td>
              <td>{formatAdminTime(ticket.issued_at)}</td>
              <td>{formatAdminTime(ticket.scheduled_at)}</td>
              <td>{ticket.called_at ? formatAdminTime(ticket.called_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketScanner({
  busy,
  onRead,
}: {
  busy: boolean;
  onRead: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef("");
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let missingFrames = 0;

    const scan = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && !busyRef.current) {
        const sourceWidth = video.videoWidth;
        const sourceHeight = video.videoHeight;
        const scale = sourceWidth > 720 ? 720 / sourceWidth : 1;
        const width = Math.round(sourceWidth * scale);
        const height = Math.round(sourceHeight * scale);
        if (width && height) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context?.drawImage(video, 0, 0, width, height);
          const pixels = context?.getImageData(0, 0, width, height);
          const result = pixels
            ? jsQR(pixels.data, width, height, { inversionAttempts: "dontInvert" })
            : null;
          if (result?.data) {
            missingFrames = 0;
            if (result.data !== lastCodeRef.current) {
              lastCodeRef.current = result.data;
              onRead(result.data);
            }
          } else if (lastCodeRef.current) {
            missingFrames += 1;
            if (missingFrames >= 4) {
              lastCodeRef.current = "";
              missingFrames = 0;
            }
          }
        }
      }
      timer = window.setTimeout(scan, 140);
    };

    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          void videoRef.current.play();
        }
        timer = window.setTimeout(scan, 140);
      })
      .catch(() => setCameraError("カメラを使用できません。ブラウザのカメラ権限を許可してください。"));

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onRead]);

  return (
    <div className={styles.ticketScanner}>
      <div>
        <video ref={videoRef} playsInline muted aria-label="整理券QR読み取りカメラ" />
        <span aria-hidden="true" />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <p>{busy ? "QRコードを確認中…" : "来場者のQRコードを枠内に入れてください。"}</p>
      {cameraError && <p className={styles.adminError} role="alert">{cameraError}</p>}
    </div>
  );
}

function formatAdminTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
