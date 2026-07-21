"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { LoaderCircle, NotebookPen, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ScheduleScreenProps = {
  onBack: () => void;
  supabaseUrl: string;
  supabasePublishableKey: string;
  classmateToken?: string;
};

type AvailabilityStatus = "available" | "unavailable";

type AvailabilityRow = {
  available_date: string;
  status: AvailabilityStatus;
};

type PortalMember = {
  user_id: string;
  display_name: string;
  discord_id: string | null;
  status: "pending" | "approved" | "rejected";
};

type ScheduleEvent = {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  assignee: string;
  team: string;
  location: string;
  description: string;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const AVAILABILITY_MONTH = new Date(2026, 7, 1);
const AVAILABILITY_MONTH_START = "2026-08-01";
const AVAILABILITY_MONTH_END = "2026-08-31";
const AVAILABILITY_CLOSED_START = "2026-08-10";
const AVAILABILITY_CLOSED_END = "2026-08-17";
const SCHEDULE_FIELDS = "id,title,event_date:available_date,start_time:available_time,end_time,assignee,team,location,description";
const MANUALS = [
  "🟢レイアウト班",
  "🔵ギミック班",
  "🟣装飾班",
  "🔴小道具制作班",
  "🟡物語班",
  "受付",
  "スタッフ",
  "宣伝",
] as const;

export function ScheduleScreen({
  onBack,
  supabaseUrl,
  supabasePublishableKey,
  classmateToken = "",
}: ScheduleScreenProps) {
  const client = useMemo(() => {
    if (!supabaseUrl || !supabasePublishableKey) return null;
    return createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }, [supabasePublishableKey, supabaseUrl]);

  const [session, setSession] = useState<Session | null | undefined>(() =>
    client ? undefined : null,
  );
  const [authError, setAuthError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [member, setMember] = useState<PortalMember | null | undefined>();
  const [view, setView] = useState<"schedule" | "availability" | "manuals">("schedule");
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (!client) return;

    let active = true;
    void client.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error) setAuthError("ログイン状態を確認できませんでした。");
      if (data.session) {
        const refreshed = await client.auth.refreshSession();
        if (active) setSession(refreshed.data.session ?? data.session);
      } else {
        setSession(null);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!client || !session) {
      const clearMember = window.setTimeout(() => setMember(null), 0);
      return () => window.clearTimeout(clearMember);
    }

    let active = true;
    const loadMember = async () => {
      const existing = await client
        .from("member_approvals")
        .select("user_id,display_name,discord_id,status:approval_status")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (existing.data) {
        if (active) setMember(existing.data as PortalMember);
        return;
      }

      const metadata = session.user.user_metadata;
      await client.from("member_approvals").insert({
        user_id: session.user.id,
        display_name: metadata.full_name ?? metadata.name ?? metadata.preferred_username ?? "Discordユーザー",
        discord_id: metadata.provider_id ?? null,
        approval_status: "pending",
      });
      const requested = await client
        .from("member_approvals")
        .select("user_id,display_name,discord_id,status:approval_status")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (active) setMember((requested.data as PortalMember | null) ?? null);
    };
    void loadMember();
    return () => {
      active = false;
    };
  }, [client, session]);

  useEffect(() => {
    if (!client) {
      const unavailable = window.setTimeout(() => setScheduleLoading(false), 0);
      return () => window.clearTimeout(unavailable);
    }

    const canUseDiscord = Boolean(session && member?.status === "approved");
    if (!classmateToken && !canUseDiscord) {
      const unavailable = window.setTimeout(() => setScheduleLoading(false), 0);
      return () => window.clearTimeout(unavailable);
    }

    let active = true;
    const loadSchedule = async () => {
      if (active) {
        setScheduleLoading(true);
        setScheduleError("");
      }

      const result = canUseDiscord
        ? await client
            .from("class_schedule")
            .select(SCHEDULE_FIELDS)
            .not("title", "is", null)
            .order("available_date", { ascending: true })
            .order("available_time", { ascending: true, nullsFirst: false })
        : await client.rpc("classmate_schedule", { p_token: classmateToken });

      if (!active) return;
      if (result.error) {
        setScheduleError("スケジュールを読み込めませんでした。");
      } else {
        setScheduleEvents((result.data ?? []) as ScheduleEvent[]);
      }
      setScheduleLoading(false);
    };

    void loadSchedule();
    const refresh = window.setInterval(() => void loadSchedule(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [classmateToken, client, member?.status, session]);

  const signInWithDiscord = async () => {
    if (!client) return;
    setSigningIn(true);
    setAuthError("");
    window.sessionStorage.setItem("mononoke-open-availability", "1");

    const { error } = await client.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`,
      },
    });

    if (error) {
      window.sessionStorage.removeItem("mononoke-open-availability");
      setSigningIn(false);
      setAuthError("Discordログインを開始できませんでした。設定を確認してください。");
    }
  };

  if (view === "manuals") {
    return <ManualList onBack={() => setView("schedule")} />;
  }

  if (!client) {
    return (
      <SchedulePortal
        onBack={onBack}
        onManuals={() => setView("manuals")}
        showDiscordAction={false}
        events={scheduleEvents}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        authError="Supabaseの接続設定を読み込めませんでした。"
      />
    );
  }

  if (session === undefined) {
    return (
      <SchedulePortal
        onBack={onBack}
        onManuals={() => setView("manuals")}
        showDiscordAction
        events={scheduleEvents}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        discordBusy
      />
    );
  }

  if (classmateToken && view === "availability") {
    return (
      <AvailabilityCalendar
        client={client}
        classmateToken={classmateToken}
        onBack={() => setView("schedule")}
        editingEnabled
      />
    );
  }

  if (!session) {
    return (
      <SchedulePortal
        onBack={onBack}
        onAvailability={classmateToken ? () => setView("availability") : () => void signInWithDiscord()}
        onManuals={() => setView("manuals")}
        showDiscordAction
        events={scheduleEvents}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        discordBusy={signingIn}
        authError={authError}
      />
    );
  }

  if (member === undefined) {
    return (
      <SchedulePortal
        onBack={onBack}
        onManuals={() => setView("manuals")}
        showDiscordAction
        events={scheduleEvents}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        discordBusy
      />
    );
  }

  if (!member || member.status !== "approved") {
    return <ApprovalWaiting onBack={onBack} rejected={member?.status === "rejected"} onSignOut={() => client.auth.signOut()} />;
  }

  if (view === "availability") {
    return (
      <AvailabilityCalendar
        client={client}
        session={session}
        onBack={() => setView("schedule")}
        onSignOut={() => client.auth.signOut()}
        editingEnabled
      />
    );
  }

  return (
    <SchedulePortal
      onBack={onBack}
      onAvailability={() => setView("availability")}
      onManuals={() => setView("manuals")}
      showDiscordAction
      events={scheduleEvents}
      loading={scheduleLoading}
      scheduleError={scheduleError}
      discordApproved
    />
  );
}

function SimpleSchedulePage({
  onBack,
  title,
  children,
}: {
  onBack: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="subScreen combinedScheduleScreen" aria-labelledby="combined-schedule-title">
      <ScreenTitle id="combined-schedule-title" title={title} onBack={onBack} />
      {children}
    </section>
  );
}

function SchedulePortal({
  onBack,
  onAvailability,
  onManuals,
  showDiscordAction,
  events,
  loading,
  scheduleError,
  discordApproved = false,
  discordBusy = false,
  authError = "",
}: {
  onBack: () => void;
  onAvailability?: () => void;
  onManuals: () => void;
  showDiscordAction: boolean;
  events: ScheduleEvent[];
  loading: boolean;
  scheduleError: string;
  discordApproved?: boolean;
  discordBusy?: boolean;
  authError?: string;
}) {
  return (
    <SimpleSchedulePage onBack={onBack} title="スケジュールを確認する">
      <div
        className="scheduleCarouselViewport scheduleSlide-timeline"
        aria-live="polite"
        aria-label="日程"
      >
        <ScheduleTimeline events={events} loading={loading} error={scheduleError} />
      </div>

      {showDiscordAction && (
        <button
          type="button"
          className={`scheduleAvailabilityEntry ${discordApproved ? "discordApproved" : ""}`}
          onClick={onAvailability}
          disabled={discordBusy || !onAvailability}
          aria-label="Discordでログインして空き日程を選択"
        >
          {discordBusy ? (
            <LoaderCircle className="spinIcon" aria-hidden="true" />
          ) : (
            <span className="scheduleDiscordIcon" aria-hidden="true" />
          )}
          <span>{discordBusy ? "確認中" : "空き日程の選択"}</span>
        </button>
      )}
      <button type="button" className="scheduleManualEntry" onClick={onManuals}>
        <NotebookPen aria-hidden="true" />
        <span>マニュアル一覧</span>
      </button>
      {authError && <p className="cornerAuthError" role="alert">{authError}</p>}
    </SimpleSchedulePage>
  );
}

function ScheduleTimeline({
  events,
  loading,
  error,
}: {
  events: ScheduleEvent[];
  loading: boolean;
  error: string;
}) {
  const [now, setNow] = useState(() => new Date());
  const dateKeys = useMemo(
    () => Array.from(new Set(events.map((event) => event.event_date))).sort(),
    [events],
  );
  const [requestedDate, setRequestedDate] = useState("");
  const selectedDate = dateKeys.includes(requestedDate)
    ? requestedDate
    : defaultScheduleDate(dateKeys, now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading) return <ScheduleState icon="loading" message="スケジュールを読み込み中" />;
  if (error) return <ScheduleState message={error} />;
  if (!events.length) return <ScheduleState message="予定はまだ登録されていません" />;

  const dayEvents = events.filter((event) => event.event_date === selectedDate);
  const slots = Array.from(
    new Map(dayEvents.map((event) => [scheduleSlotKey(event), event])).values(),
  ).sort(compareScheduleEvents);
  const rows = Array.from(new Set(dayEvents.map(scheduleRowLabel)));
  const activeIds = new Set(
    events.filter((event) => isEventActive(event, now)).map((event) => event.id),
  );
  const nextEvent = events
    .filter((event) => eventStart(event).getTime() > now.getTime())
    .sort(compareScheduleEvents)[0];
  const focusEvent = events.find((event) => activeIds.has(event.id)) ?? nextEvent;

  return (
    <div className="scheduleTimelinePanel">
      <label className="scheduleDayPicker">
        <span className="srOnly">表示する日</span>
        <select value={selectedDate} onChange={(event) => setRequestedDate(event.target.value)}>
          {dateKeys.map((date, index) => (
            <option value={date} key={date}>{index + 1}日目（{formatJapaneseDate(date)}）</option>
          ))}
        </select>
      </label>

      {focusEvent && (
        <div className="scheduleCurrentRole">
          <span>{activeIds.has(focusEvent.id) ? `${formatTime(focusEvent.end_time) || "終了"}まで` : `${formatTime(focusEvent.start_time) || formatJapaneseDate(focusEvent.event_date)}から`}</span>
          <strong>{focusEvent.title}</strong>
        </div>
      )}

      <div className="liveScheduleTableWrap">
        <div
          className="liveScheduleTable"
          style={{ gridTemplateColumns: `minmax(150px, 1.1fr) repeat(${Math.max(slots.length, 1)}, minmax(130px, 1fr))` }}
          role="table"
          aria-label={`${formatJapaneseDate(selectedDate)}のスケジュール`}
        >
          <div className="liveScheduleCorner" role="columnheader" />
          {slots.map((slot) => (
            <div className="liveScheduleTime" role="columnheader" key={scheduleSlotKey(slot)}>
              {formatTimeRange(slot)}
            </div>
          ))}
          {rows.map((row) => (
            <div className="liveScheduleRow" role="row" key={row}>
              <div className="liveScheduleLabel" role="rowheader">{row}</div>
              {slots.map((slot) => {
                const cellEvents = dayEvents.filter(
                  (event) => scheduleRowLabel(event) === row && scheduleSlotKey(event) === scheduleSlotKey(slot),
                );
                const isNow = cellEvents.some((event) => activeIds.has(event.id));
                const isNext = Boolean(nextEvent && cellEvents.some((event) => event.id === nextEvent.id));
                const state = isNow ? "now" : isNext ? "next" : cellEvents.length ? "scheduled" : "empty";
                return (
                  <div
                    className={`liveScheduleCell ${state}`}
                    role="cell"
                    key={`${row}-${scheduleSlotKey(slot)}`}
                    title={cellEvents.map(scheduleEventSummary).join(" / ")}
                  >
                    {isNow ? "NOW" : isNext ? "Next" : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleState({ message, icon }: { message: string; icon?: "loading" }) {
  return (
    <div className="scheduleState" role="status">
      {icon === "loading" && <LoaderCircle className="spinIcon" aria-hidden="true" />}
      <span>{message}</span>
    </div>
  );
}

function ManualList({ onBack }: { onBack: () => void }) {
  return (
    <section className="subScreen manualScreen" aria-labelledby="manual-title">
      <ScreenTitle id="manual-title" title="マニュアル一覧" onBack={onBack} />
      <div className="manualList">
        {MANUALS.map((manual) => (
          <details className="manualItem" key={manual}>
            <summary>{manual}</summary>
            <div className="manualBody">マニュアルの内容は準備中です。</div>
          </details>
        ))}
      </div>
    </section>
  );
}

function AvailabilityCalendar({
  client,
  session,
  classmateToken = "",
  onBack,
  onSignOut,
  editingEnabled,
}: {
  client: SupabaseClient;
  session?: Session;
  classmateToken?: string;
  onBack: () => void;
  onSignOut?: () => Promise<unknown>;
  editingEnabled: boolean;
}) {
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState("");
  const [dataError, setDataError] = useState("");

  const calendarDays = useMemo(() => getCalendarDays(AVAILABILITY_MONTH), []);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setDataError("");
    const result = classmateToken
      ? await client.rpc("classmate_availability", { p_token: classmateToken })
      : await client
          .from("member_availability")
          .select("available_date,status:availability_status")
          .eq("user_id", session!.user.id)
          .gte("available_date", AVAILABILITY_MONTH_START)
          .lte("available_date", AVAILABILITY_MONTH_END);
    const { data, error } = result;

    if (error) {
      setDataError("回答を読み込めませんでした。もう一度お試しください。");
    } else {
      const next: Record<string, AvailabilityStatus> = {};
      ((data ?? []) as AvailabilityRow[]).forEach((row) => {
        next[row.available_date] = row.status;
      });
      setAvailability(next);
    }
    setLoading(false);
  }, [classmateToken, client, session]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadAvailability(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadAvailability]);

  const cycleAvailability = async (dateKey: string) => {
    if (savingDate || !editingEnabled) return;
    const previous = availability[dateKey];
    const next: AvailabilityStatus | undefined =
      previous === undefined
        ? "available"
        : previous === "available"
          ? "unavailable"
          : undefined;

    setAvailability((current) => {
      const updated = { ...current };
      if (next) updated[dateKey] = next;
      else delete updated[dateKey];
      return updated;
    });
    setSavingDate(dateKey);
    setDataError("");

    const result = classmateToken
      ? await client.rpc("set_classmate_availability", {
          p_token: classmateToken,
          p_date: dateKey,
          p_status: next ?? null,
        })
      : next
        ? await client.from("member_availability").upsert(
            {
              user_id: session!.user.id,
              available_date: dateKey,
              availability_status: next,
            },
            { onConflict: "user_id,available_date" },
          )
        : await client
            .from("member_availability")
            .delete()
            .eq("user_id", session!.user.id)
            .eq("available_date", dateKey);

    if (result.error) {
      setAvailability((current) => {
        const reverted = { ...current };
        if (previous) reverted[dateKey] = previous;
        else delete reverted[dateKey];
        return reverted;
      });
      setDataError("回答を保存できませんでした。通信状態を確認してください。");
    }
    setSavingDate("");
  };

  return (
    <section className="subScreen availabilityScreen" aria-labelledby="availability-title">
      <div className="availabilityHeaderRow">
        <ScreenTitle id="availability-title" title="空き日程の選択" onBack={onBack} />
        <div className="availabilityLegend" aria-label="回答の色">
          <span><i className="availableLegend" />参加できる</span>
          <span><i className="unavailableLegend" />参加できない</span>
        </div>
      </div>

      <div className="availabilityContent">
        <p className="availabilityInstruction">13:30〜14:30に学校に来れる日を選んでください。なお、土休日は行いません。</p>
        {!editingEnabled && <strong className="editingClosed">編集受付は終了しました</strong>}

        {dataError && <p className="availabilityError" role="alert">{dataError}</p>}

        <div className="availabilityTable" aria-busy={loading}>
          <div className="availabilityWeekdays" role="row">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} role="columnheader">{weekday}</div>
            ))}
          </div>
          <div className="availabilityGrid" role="grid" aria-label="2026年8月の空き日程カレンダー">
            {calendarDays.map((day) => {
              const dateKey = toDateKey(day);
              const inMonth = day.getFullYear() === 2026 && day.getMonth() === 7;
              const status = availability[dateKey];
              const isSaving = savingDate === dateKey;
              const isSunday = day.getDay() === 0;
              const isSaturday = day.getDay() === 6;
              const isWeekend = isSunday || isSaturday;
              const isClosedPeriod = dateKey >= AVAILABILITY_CLOSED_START && dateKey <= AVAILABILITY_CLOSED_END;
              const isUnavailableDate = isWeekend || isClosedPeriod;

              if (!inMonth) {
                return <div className="availabilityBlank" key={dateKey} role="gridcell" />;
              }

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`availabilityDay ${status ?? "unset"} ${isSunday ? "sunday" : ""} ${isSaturday ? "saturday" : ""} ${isClosedPeriod ? "closedPeriod" : ""}`}
                  onClick={() => {
                    if (!isUnavailableDate) void cycleAvailability(dateKey);
                  }}
                  disabled={isUnavailableDate || Boolean(savingDate) || !editingEnabled}
                  role="gridcell"
                  aria-label={`${day.getDate()}日：${isUnavailableDate ? "選択できません" : statusLabel(status)}`}
                >
                  <span>{day.getDate()}</span>
                  {isSaving && <LoaderCircle className="spinIcon daySaving" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {loading && (
            <div className="availabilityLoading" role="status">
              <LoaderCircle className="spinIcon" aria-hidden="true" />
              回答を読み込み中
            </div>
          )}
        </div>
      </div>

      {onSignOut && (
        <button
          type="button"
          className="availabilityLogout"
          onClick={() => void onSignOut()}
        >
          <span className="discordLogoutIcon" aria-hidden="true" />
          <span>ログアウト</span>
        </button>
      )}
    </section>
  );
}

function ApprovalWaiting({
  onBack,
  rejected,
  onSignOut,
}: {
  onBack: () => void;
  rejected: boolean;
  onSignOut: () => Promise<unknown>;
}) {
  return (
    <section className="subScreen approvalWaitingScreen" aria-labelledby="approval-title">
      <ScreenTitle id="approval-title" title="メンバー承認" onBack={onBack} />
      <div className="approvalWaitingCard">
        <UserCheck aria-hidden="true" />
        <h2>{rejected ? "利用が承認されていません" : "管理者の承認を待っています"}</h2>
        <p>{rejected ? "必要な場合は運営担当者に確認してください。" : "承認後、もう一度この画面を開くと空き日程を入力できます。"}</p>
        <button
          type="button"
          className="approvalDiscordLogout"
          onClick={() => void onSignOut()}
        >
          <span className="discordLogoutIcon" aria-hidden="true" />
          <span>ログアウト</span>
        </button>
      </div>
    </section>
  );
}

function ScreenTitle({
  id,
  title,
  onBack,
}: {
  id: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <button type="button" className="combinedBackTitle" onClick={onBack}>
      <span className="textBackGlyph" aria-hidden="true">&lt;</span>
      <h1 id={id}>{title}</h1>
    </button>
  );
}

function defaultScheduleDate(dateKeys: string[], now: Date) {
  const today = toDateKey(now);
  return dateKeys.find((date) => date >= today) ?? dateKeys.at(-1) ?? "";
}

function scheduleRowLabel(event: ScheduleEvent) {
  return event.team.trim() || event.assignee.trim() || event.title;
}

function scheduleSlotKey(event: ScheduleEvent) {
  return `${event.start_time ?? ""}|${event.end_time ?? ""}`;
}

function compareScheduleEvents(left: ScheduleEvent, right: ScheduleEvent) {
  return eventStart(left).getTime() - eventStart(right).getTime()
    || left.title.localeCompare(right.title, "ja");
}

function eventStart(event: ScheduleEvent) {
  const date = parseDate(event.event_date);
  const [hours, minutes, seconds] = parseTime(event.start_time);
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

function eventEnd(event: ScheduleEvent) {
  const start = eventStart(event);
  if (!event.end_time) {
    if (event.start_time) return new Date(start.getTime() + 60 * 60 * 1000);
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  }
  const end = parseDate(event.event_date);
  const [hours, minutes, seconds] = parseTime(event.end_time);
  end.setHours(hours, minutes, seconds, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
}

function isEventActive(event: ScheduleEvent, now: Date) {
  return eventStart(event) <= now && now < eventEnd(event);
}

function parseDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function parseTime(time: string | null) {
  if (!time) return [0, 0, 0] as const;
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return [hours || 0, minutes || 0, seconds || 0] as const;
}

function formatTime(time: string | null) {
  return time ? time.slice(0, 5) : "";
}

function formatTimeRange(event: ScheduleEvent) {
  const start = formatTime(event.start_time);
  const end = formatTime(event.end_time);
  if (!start && !end) return "終日";
  if (!end) return start;
  return `${start}〜${end}`;
}

function formatJapaneseDate(dateKey: string) {
  if (!dateKey) return "";
  const date = parseDate(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function scheduleEventSummary(event: ScheduleEvent) {
  return [event.title, formatTimeRange(event), event.location, event.assignee]
    .filter(Boolean)
    .join("・");
}

function getCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function toDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function statusLabel(status?: AvailabilityStatus) {
  if (status === "available") return "参加できる";
  if (status === "unavailable") return "参加できない";
  return "未回答";
}
