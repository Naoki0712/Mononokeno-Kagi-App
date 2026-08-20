"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import jsQR from "jsqr";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./waiting.module.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CLASSMATE_SESSION_KEY = "mononoke-classmate-session";

type AdminTicketStatus = "waiting" | "called" | "redeemed" | "expired" | "cancelled";

type AdminTicket = {
  ticket_number: number;
  status: AdminTicketStatus;
  issued_at: string;
  scheduled_at: string;
  called_at: string | null;
  redeemed_at: string | null;
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
      <header className={styles.adminHeader}>
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
      </header>

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
        <section className={styles.adminDashboard}>
          <div className={styles.adminToolbar}>
            <p>ID {snapshot.admin_student_id}</p>
            <button type="button" onClick={logout}>ログアウト</button>
          </div>

          {message && <div className={styles.adminMessage} role="status">{message}</div>}

          <div className={styles.adminStats}>
            <Stat label="発行済み" value={snapshot.last_issued_number} />
            <Stat label="待機中" value={snapshot.waiting_count} />
            <Stat label="呼出中" value={snapshot.called_count} />
            <Stat label="受付済み" value={snapshot.redeemed_count} />
          </div>

          <div className={styles.adminGrid}>
            <section className={styles.adminPanel}>
              <div className={styles.panelHeading}>
                <div>
                  <p>ISSUING</p>
                  <h2>発行設定</h2>
                </div>
                <span className={draftEnabled ? styles.liveBadge : styles.stoppedBadge}>
                  {draftEnabled ? "発行中" : "停止中"}
                </span>
              </div>
              <label className={styles.toggleRow}>
                <span>整理券を発行する</span>
                <input
                  type="checkbox"
                  checked={draftEnabled}
                  onChange={(event) => {
                    setDraftEnabled(event.target.checked);
                    settingsDirtyRef.current = true;
                  }}
                />
              </label>
              <label className={styles.waitInput}>
                <span>案内する待ち時間</span>
                <span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={draftWait}
                    onChange={(event) => {
                      setDraftWait(Math.min(240, Math.max(1, Number(event.target.value) || 1)));
                      settingsDirtyRef.current = true;
                    }}
                  />
                  分
                </span>
              </label>
              <button
                className={styles.primaryAdminButton}
                type="button"
                disabled={busy === "settings"}
                onClick={() => void saveSettings()}
              >
                {busy === "settings" ? "保存中…" : "設定を保存"}
              </button>
            </section>

            <section className={styles.adminPanel}>
              <div className={styles.panelHeading}>
                <div>
                  <p>CALL</p>
                  <h2>番号を呼び出す</h2>
                </div>
              </div>
              <p className={styles.nextNumberLabel}>次の番号</p>
              <strong className={styles.nextNumber}>
                {snapshot.next_waiting_number ?? "—"}
              </strong>
              <button
                className={styles.callButton}
                type="button"
                disabled={busy === "call" || snapshot.next_waiting_number === null}
                onClick={() => void callNext()}
              >
                {busy === "call" ? "処理中…" : "次の番号を呼び出す"}
              </button>
            </section>
          </div>

          <section className={styles.adminPanel}>
            <div className={styles.panelHeading}>
              <div>
                <p>RECEPTION</p>
                <h2>受付QR確認</h2>
              </div>
              <button
                className={styles.secondaryAdminButton}
                type="button"
                onClick={() => setScannerOpen((open) => !open)}
              >
                {scannerOpen ? "カメラを閉じる" : "カメラを開く"}
              </button>
            </div>
            {scannerOpen && (
              <TicketScanner
                busy={busy === "scan"}
                onRead={redeemQr}
              />
            )}
          </section>

          <section className={styles.adminPanel}>
            <div className={styles.panelHeading}>
              <div>
                <p>TICKETS</p>
                <h2>本日の整理券</h2>
              </div>
              <button
                className={styles.secondaryAdminButton}
                type="button"
                onClick={() => void refresh(token, true)}
              >
                更新
              </button>
            </div>
            <TicketTable tickets={snapshot.tickets} />
          </section>
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
