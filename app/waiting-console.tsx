"use client";

import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type TicketStatus = "waiting" | "called" | "pending";
type Ticket = {
  ticket_number: number;
  status: TicketStatus;
  pending_at: string | null;
  manually_issued: boolean;
};
type Snapshot = { ok: true; tickets: Ticket[] };

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
    await refresh();
  };

  const addManual = async () => {
    if (!client || busy) return;
    setBusy(true); setMessage("");
    const { data, error } = await client.rpc("waiting_admin_issue_manual", { p_classmate_token: classmateToken });
    setBusy(false);
    if (error || !data?.ok) setMessage("整理券を手動発行できませんでした。");
    else { setMessage(`${Number(data.ticket_number)}番を追加しました。`); await refresh(); }
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
        <button type="button" className={view === 1 ? "active" : ""} onClick={() => setView(1)}>1</button>
        <button type="button" className={view === 2 ? "active" : ""} onClick={() => setView(2)}>2</button>
      </div>
      {message && <p className="waitingConsoleMessage" role="status">{message}</p>}
      {!snapshot ? <p className="waitingConsoleLoading">整理券情報を読み込み中</p> : view === 1
        ? <VisitorBoard tickets={snapshot.tickets} />
        : <StaffBoard tickets={snapshot.tickets} now={now} busy={busy} onMove={moveTicket} onAdd={addManual} />}
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

function StaffBoard({ tickets, now, busy, onMove, onAdd }: {
  tickets: Ticket[]; now: number; busy: boolean;
  onMove: (number: number, status: TicketStatus) => Promise<void>;
  onAdd: () => Promise<void>;
}) {
  return (
    <div className="waitingStaffBoard">
      <div className="waitingStaffLanes">
        <Lane title="保留中" status="pending" tickets={tickets} now={now} onMove={onMove} />
        <Lane title="呼び出し中（1つだけ選択可）" status="called" tickets={tickets} now={now} onMove={onMove} />
        <div className="waitingLaneTitle waitingUpcomingTitle"><h2>呼び出し前</h2><p lang="en">Up next</p><button type="button" disabled={busy} onClick={() => void onAdd()}>✋ 手動で追加</button></div>
        <Lane title="" status="waiting" tickets={tickets} now={now} onMove={onMove} hideTitle />
      </div>
      <aside className="waitingScript"><h2>受付用スクリプト</h2><p>後ほど追加します</p></aside>
    </div>
  );
}

function Lane({ title, status, tickets, now, onMove, hideTitle = false }: {
  title: string; status: TicketStatus; tickets: Ticket[]; now: number;
  onMove: (number: number, status: TicketStatus) => Promise<void>; hideTitle?: boolean;
}) {
  const lane = tickets.filter((ticket) => ticket.status === status);
  return <section className={`waitingLane waitingLane-${status}`}
    onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); const number = Number(event.dataTransfer.getData("text/plain")); if (number) void onMove(number, status); }}>
    {!hideTitle && <div className="waitingLaneTitle"><h2>{title}</h2><p lang="en">{status === "pending" ? "Pending" : "Calling"}</p></div>}
    <div className="waitingTicketStrip">
      {!lane.length && <span className="waitingEmptyLane">番号なし</span>}
      {lane.map((ticket) => {
        const elapsed = ticket.pending_at ? Math.max(0, now - new Date(ticket.pending_at).getTime()) : 0;
        const overdue = status === "pending" && elapsed >= 900000;
        return <button type="button" draggable key={ticket.ticket_number}
          className={`waitingTicket ${ticket.manually_issued ? "manual" : ""} ${overdue ? "overdue" : ""}`}
          onDragStart={(event) => event.dataTransfer.setData("text/plain", String(ticket.ticket_number))}>
          <strong>{ticket.manually_issued && <span>✋</span>}{ticket.ticket_number}</strong>
          {status === "pending" && <small>{formatElapsed(elapsed)}</small>}
        </button>;
      })}
    </div>
  </section>;
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
