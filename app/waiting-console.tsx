"use client";

import { createClient } from "@supabase/supabase-js";
import jsQR from "jsqr";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type TicketStatus = "waiting" | "called" | "pending";
type Ticket = {
  ticket_number: number;
  status: TicketStatus;
  issued_at: string;
  scheduled_at: string;
  pending_at: string | null;
  manually_issued: boolean;
};
type Snapshot = { ok: true; tickets: Ticket[] };
type TicketMenu = {
  ticketNumber: number;
  status: TicketStatus;
  left: number;
  top: number;
};

export function WaitingConsole({
  supabaseUrl,
  supabasePublishableKey,
  classmateToken,
  studentId,
  onBack,
}: {
  supabaseUrl: string;
  supabasePublishableKey: string;
  classmateToken: string;
  studentId: string;
  onBack: () => void;
}) {
  const client = useMemo(() => supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } })
    : null, [supabasePublishableKey, supabaseUrl]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<1 | 2>(2);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ticketMenu, setTicketMenu] = useState<TicketMenu | null>(null);

  const refresh = useCallback(async () => {
    if (!client || !classmateToken) return;
    const { data, error } = await client.rpc("waiting_admin_snapshot", { p_classmate_token: classmateToken });
    if (!error && data?.ok) setSnapshot(data as Snapshot);
  }, [classmateToken, client]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const poll = window.setInterval(() => void refresh(), 1000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [refresh]);

  const moveTicket = async (ticketNumber: number, status: TicketStatus) => {
    if (!client || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_move_ticket", {
      p_classmate_token: classmateToken, p_ticket_number: ticketNumber, p_status: status,
    });
    setBusy(false);
    if (error || !data?.ok) {
      setMessage(data?.reason === "called_slot_occupied" ? "呼び出し中に置ける番号は1つまでです。" : "番号を移動できませんでした。");
      return;
    }
    setTicketMenu(null);
    await refresh();
  };

  const deleteTicket = async (ticketNumber: number) => {
    if (!client || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_delete_ticket", {
      p_classmate_token: classmateToken,
      p_ticket_number: ticketNumber,
    });
    setBusy(false);
    setTicketMenu(null);
    if (error || !data?.ok) {
      setMessage("番号を削除できませんでした。");
      return;
    }
    setMessage(`${ticketNumber}番を削除しました。`);
    await refresh();
  };

  const redeemQr = useCallback(async (code: string) => {
    if (!client) return false;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_redeem", {
      p_classmate_token: classmateToken,
      p_qr_code: code,
    });
    setBusy(false);
    if (error || !data?.ok) {
      const number = data?.ticket_number ? `${Number(data.ticket_number)}番：` : "";
      const reasonMessage: Record<string, string> = {
        not_called: "まだ呼び出していません。",
        expired: "受付可能な15分を過ぎています。",
        invalid_qr: "整理券のQRコードではありません。",
        cancelled: "この整理券は利用できません。",
      };
      setMessage(`${number}${reasonMessage[String(data?.reason)] ?? "QRコードを確認できませんでした。"}`);
      return false;
    }
    const suffix = data.reason === "already_redeemed" ? "はすでに受付済みです。" : "を受付済みにしました。";
    setMessage(`${Number(data.ticket_number)}番${suffix}`);
    await refresh();
    return true;
  }, [classmateToken, client, refresh]);

  const addManual = async () => {
    if (!client || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_issue_manual", { p_classmate_token: classmateToken });
    setBusy(false);
    if (error || !data?.ok) setMessage("整理券を手動発行できませんでした。");
    else { setMessage(`${Number(data.ticket_number)}番を追加しました。`); await refresh(); }
  };

  const resetTickets = async () => {
    if (!client || busy) return;
    const confirmed = window.confirm("本日の整理券をすべて削除し、次の番号を1番に戻しますか？");
    if (!confirmed) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_reset_tickets", {
      p_classmate_token: classmateToken,
    });
    setBusy(false);
    if (error || !data?.ok) {
      setMessage("整理券番号をリセットできませんでした。");
      return;
    }
    setTicketMenu(null);
    setMessage("本日の整理券番号をリセットしました。次は1番です。");
    await refresh();
  };

  return (
    <section className="subScreen waitingConsoleScreen" aria-labelledby="waiting-console-title">
      <header className="screenHeader waitingConsoleHeader">
        <button type="button" className="backTitle" onClick={onBack}>
          <span className="textBackGlyph" aria-hidden="true">&lt;</span>
          <h1 id="waiting-console-title">受付のシステムを使う</h1>
        </button>
      </header>
      <div className="waitingViewSwitch" aria-label="画面を切り替える">
        <button type="button" className={view === 1 ? "active" : ""} onClick={() => { setView(1); setTicketMenu(null); }}>1</button>
        <button type="button" className={view === 2 ? "active" : ""} onClick={() => setView(2)}>2</button>
      </div>
      {message && <p className="waitingConsoleMessage" role="status">{message}</p>}
      {!snapshot ? <p className="waitingConsoleLoading">整理券情報を読み込み中</p> : view === 1
        ? <VisitorBoard tickets={snapshot.tickets} />
        : <StaffBoard tickets={snapshot.tickets} now={now} busy={busy} onMove={moveTicket} onAdd={addManual}
            onOpenMenu={setTicketMenu} onOpenScanner={() => setScannerOpen(true)} onReset={resetTickets} />}
      {ticketMenu && (
        <TicketActionMenu
          menu={ticketMenu}
          busy={busy}
          onMove={moveTicket}
          onDelete={deleteTicket}
          onClose={() => setTicketMenu(null)}
        />
      )}
      {scannerOpen && <TicketScanner busy={busy} onRead={redeemQr} onClose={() => setScannerOpen(false)} />}
      <p className="waitingConsoleIdentity">ID {studentId}</p>
    </section>
  );
}

function VisitorBoard({ tickets }: { tickets: Ticket[] }) {
  const called = tickets.find((ticket) => ticket.status === "called");
  const waiting = tickets.filter((ticket) => ticket.status === "waiting").slice(0, 6);
  const pending = tickets.filter((ticket) => ticket.status === "pending").slice(0, 4);
  return (
    <div className="waitingVisitorBoard">
      <div className="waitingSvgPanel callingSvgPanel">
        <Image src={`${BASE_PATH}/assets/iPad${called ? "1" : "3"}.svg`} alt="" fill unoptimized priority />
        {called && <strong className="waitingCalledNumber">{called.ticket_number}</strong>}
      </div>
      <div className="waitingSvgPanel queueSvgPanel">
        <Image src={`${BASE_PATH}/assets/iPad2.svg`} alt="" fill unoptimized priority />
        <div className="visitorUpcomingNumbers">{waiting.map((ticket) => <strong key={ticket.ticket_number}>{ticket.ticket_number}</strong>)}</div>
        <div className="visitorPendingNumbers">{pending.map((ticket) => <strong key={ticket.ticket_number}>{ticket.ticket_number}</strong>)}</div>
      </div>
    </div>
  );
}

function StaffBoard({ tickets, now, busy, onMove, onAdd, onOpenMenu, onOpenScanner, onReset }: {
  tickets: Ticket[]; now: number; busy: boolean;
  onMove: (number: number, status: TicketStatus) => Promise<void>;
  onAdd: () => Promise<void>;
  onOpenMenu: (menu: TicketMenu) => void;
  onOpenScanner: () => void;
  onReset: () => Promise<void>;
}) {
  return (
    <div className="waitingStaffBoard">
      <div className="waitingStaffLanes">
        <Lane title="保留中" status="pending" tickets={tickets} now={now} onMove={onMove} onOpenMenu={onOpenMenu} />
        <Lane title="呼び出し中（1つだけ選択可）" status="called" tickets={tickets} now={now} onMove={onMove} onOpenMenu={onOpenMenu} />
        <div className="waitingLaneTitle waitingUpcomingTitle"><h2>呼び出し前</h2><button type="button" disabled={busy} onClick={() => void onAdd()}>✋ 手動で追加</button></div>
        <Lane title="" status="waiting" tickets={tickets} now={now} onMove={onMove} onOpenMenu={onOpenMenu} hideTitle />
      </div>
      <aside className="waitingScript">
        <h2>整理券の受付</h2>
        <button type="button" className="waitingScanButton" onClick={onOpenScanner}>整理券を読み取る</button>
        <button type="button" className="waitingResetButton" disabled={busy} onClick={() => void onReset()}>整理券番号をリセット</button>
      </aside>
    </div>
  );
}

function Lane({ title, status, tickets, now, onMove, onOpenMenu, hideTitle = false }: {
  title: string; status: TicketStatus; tickets: Ticket[]; now: number;
  onMove: (number: number, status: TicketStatus) => Promise<void>;
  onOpenMenu: (menu: TicketMenu) => void;
  hideTitle?: boolean;
}) {
  const lane = tickets.filter((ticket) => ticket.status === status);
  return <section className={`waitingLane waitingLane-${status}`}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); const number = Number(event.dataTransfer.getData("text/plain")); if (number) void onMove(number, status); }}>
    {!hideTitle && <div className="waitingLaneTitle"><h2>{title}</h2></div>}
    <div className="waitingTicketStrip">
      {!lane.length && <span className="waitingEmptyLane">番号なし</span>}
      {lane.map((ticket) => {
        const elapsedFrom = status === "pending" ? ticket.pending_at : status === "waiting" ? ticket.issued_at : null;
        const elapsed = elapsedFrom ? Math.max(0, now - new Date(elapsedFrom).getTime()) : 0;
        const countdown = Math.max(0, new Date(ticket.scheduled_at).getTime() - now);
        const overdue = status === "pending" && elapsed >= 900000;
        return <button type="button" draggable key={ticket.ticket_number}
          className={`waitingTicket ${ticket.manually_issued ? "manual" : ""} ${overdue ? "overdue" : ""}`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenMenu({ ticketNumber: ticket.ticket_number, status, left: rect.left + rect.width / 2, top: rect.top - 10 });
          }}
          onDragStart={(event) => event.dataTransfer.setData("text/plain", String(ticket.ticket_number))}>
          <strong>{ticket.manually_issued && <span>✋</span>}{ticket.ticket_number}</strong>
          {(status === "pending" || status === "waiting") && (
            <span className="waitingTicketTimes">
              <small>{formatElapsed(elapsed)}</small>
              <small className="waitingTicketCountdown">あと {formatElapsed(countdown)}</small>
            </span>
          )}
        </button>;
      })}
    </div>
  </section>;
}

function TicketActionMenu({ menu, busy, onMove, onDelete, onClose }: {
  menu: TicketMenu;
  busy: boolean;
  onMove: (number: number, status: TicketStatus) => Promise<void>;
  onDelete: (number: number) => Promise<void>;
  onClose: () => void;
}) {
  const upTarget: TicketStatus | null = menu.status === "waiting" ? "called" : menu.status === "called" ? "pending" : null;
  const downTarget: TicketStatus | null = menu.status === "pending" ? "called" : menu.status === "called" ? "waiting" : null;
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="waitingTicketMenu" role="menu" aria-label={`${menu.ticketNumber}番の操作`}
      style={{ left: menu.left, top: menu.top }}>
      <button type="button" role="menuitem" disabled={busy || !upTarget}
        onClick={() => upTarget && void onMove(menu.ticketNumber, upTarget)} aria-label="上の欄へ移動">↑</button>
      <button type="button" role="menuitem" disabled={busy || !downTarget}
        onClick={() => downTarget && void onMove(menu.ticketNumber, downTarget)} aria-label="下の欄へ移動">↓</button>
      <button type="button" role="menuitem" className="waitingDeleteAction" disabled={busy}
        onClick={() => void onDelete(menu.ticketNumber)}>削除</button>
    </div>
  );
}

function TicketScanner({ busy, onRead, onClose }: {
  busy: boolean;
  onRead: (code: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const busyRef = useRef(busy);
  const lastCodeRef = useRef("");
  const [cameraError, setCameraError] = useState("");

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let missingFrames = 0;
    const scan = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && !busyRef.current) {
        const scale = video.videoWidth > 720 ? 720 / video.videoWidth : 1;
        const width = Math.round(video.videoWidth * scale);
        const height = Math.round(video.videoHeight * scale);
        if (width && height) {
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context?.drawImage(video, 0, 0, width, height);
          const pixels = context?.getImageData(0, 0, width, height);
          const result = pixels ? jsQR(pixels.data, width, height, { inversionAttempts: "attemptBoth" }) : null;
          if (result?.data) missingFrames = 0;
          else if (lastCodeRef.current && ++missingFrames >= 3) { lastCodeRef.current = ""; missingFrames = 0; }
          if (result?.data && result.data !== lastCodeRef.current) {
            lastCodeRef.current = result.data;
            busyRef.current = true;
            const accepted = await onRead(result.data);
            if (accepted) {
              const audio = audioRef.current;
              if (audio) { audio.currentTime = 0; void audio.play().catch(() => undefined); }
              window.setTimeout(onClose, 250);
            }
            busyRef.current = false;
          }
        }
      }
      timer = window.setTimeout(() => void scan(), 150);
    };
    void navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    }).then((mediaStream) => {
      stream = mediaStream;
      if (videoRef.current) { videoRef.current.srcObject = mediaStream; void videoRef.current.play(); }
      timer = window.setTimeout(() => void scan(), 150);
    }).catch(() => setCameraError("カメラを使用できません。ブラウザのカメラ権限を許可してください。"));
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [onClose, onRead]);

  return (
    <div className="waitingScannerBackdrop" role="dialog" aria-modal="true" aria-labelledby="waiting-scanner-title">
      <section className="waitingScannerDialog">
        <div className="waitingScannerHeader">
          <h2 id="waiting-scanner-title">整理券を読み取る</h2>
          <button type="button" onClick={onClose} aria-label="読み取り画面を閉じる">×</button>
        </div>
        <div className="waitingScannerCamera">
          <video ref={videoRef} playsInline muted aria-label="整理券QRコード読み取りカメラ" />
          <canvas ref={canvasRef} aria-hidden="true" />
          <span aria-hidden="true" />
        </div>
        <p>{cameraError || (busy ? "確認中…" : "来場者のQRコードを枠内に入れてください")}</p>
        <audio ref={audioRef} src={`${BASE_PATH}/assets/attendance-success.mp3?v=20260805-tone2`} preload="auto" />
      </section>
    </div>
  );
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
