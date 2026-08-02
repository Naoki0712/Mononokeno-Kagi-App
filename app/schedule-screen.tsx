"use client";

// Keep this screen in the GitHub Pages static build.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, List, LoaderCircle, NotebookPen, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ScheduleScreenProps = {
  onBack: () => void;
  supabaseUrl: string;
  supabasePublishableKey: string;
  classmateToken?: string;
  classmateId?: string;
};

type AvailabilityStatus = "available" | "unavailable";

type AvailabilityRow = {
  available_date: string;
  status: AvailabilityStatus;
};

type MemberScheduleRow = {
  id: string;
  available_date: string;
  status: AvailabilityStatus;
  group_name: GroupName | null;
  is_self: boolean;
};

type GroupName = "Class-leader" | "Layout" | "Gimmick" | "Decoration" | "Gadget" | "Story" | "Signboard" | "Yokai";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const AVAILABILITY_MONTH = new Date(2026, 7, 1);
const AVAILABILITY_SELECTABLE_START = "2026-08-18";
const AVAILABILITY_SELECTABLE_END = "2026-08-31";
const MANUALS = [
  "🟢レイアウト班",
  "🔵ギミック班",
  "🟣装飾班",
  "🔴小道具制作班",
  "🟡物語班",
  "🟧看板ベース",
  "🟦妖怪ベース",
  "受付",
  "スタッフ",
  "宣伝",
] as const;

export function ScheduleScreen({
  onBack,
  supabaseUrl,
  supabasePublishableKey,
  classmateToken = "",
  classmateId = "",
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

  const [view, setView] = useState<"schedule" | "details" | "availability" | "manuals">("schedule");
  const [memberSchedules, setMemberSchedules] = useState<MemberScheduleRow[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (!client) {
      const unavailable = window.setTimeout(() => setScheduleLoading(false), 0);
      return () => window.clearTimeout(unavailable);
    }

    if (!classmateToken) {
      const unavailable = window.setTimeout(() => setScheduleLoading(false), 0);
      return () => window.clearTimeout(unavailable);
    }

    let active = true;
    const loadSchedule = async () => {
      if (active) {
        setScheduleLoading(true);
        setScheduleError("");
      }

      const result = await client.rpc("classmate_member_calendar", { p_token: classmateToken });

      if (!active) return;
      if (result.error) {
        setScheduleError("スケジュールを読み込めませんでした。");
      } else {
        setMemberSchedules((result.data ?? []) as MemberScheduleRow[]);
      }
      setScheduleLoading(false);
    };

    void loadSchedule();
    const refresh = window.setInterval(() => void loadSchedule(), 60_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, [classmateToken, client]);

  const viewerGroup = memberSchedules.find(
    (row) => row.id === classmateId && row.group_name !== null,
  )?.group_name ?? null;
  const canEditAvailability = !scheduleLoading && viewerGroup === null;

  if (view === "manuals") {
    return <ManualList onBack={() => setView("schedule")} />;
  }

  if (view === "availability" && client) {
    return (
      <AvailabilityCalendar
        client={client}
        classmateToken={classmateToken}
        onBack={() => setView("schedule")}
        editingEnabled={canEditAvailability}
      />
    );
  }

  if (!client) {
    return (
      <SchedulePortal
        onBack={onBack}
        onManuals={() => setView("manuals")}
        calendarMode="month"
        rows={memberSchedules}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        authError="Supabaseの接続設定を読み込めませんでした。"
      />
    );
  }

  if (view === "details") {
    return (
      <SchedulePortal
        onBack={onBack}
        onAction={() => setView("schedule")}
        onManuals={() => setView("manuals")}
        actionLabel="月全体の予定"
        calendarMode="details"
        rows={memberSchedules}
        loading={scheduleLoading}
        scheduleError={scheduleError}
        onAvailability={canEditAvailability ? () => setView("availability") : undefined}
      />
    );
  }

  return (
    <SchedulePortal
      onBack={onBack}
      onAction={() => setView("details")}
      onManuals={() => setView("manuals")}
      actionLabel="詳細の予定"
      calendarMode="month"
      rows={memberSchedules}
      loading={scheduleLoading}
      scheduleError={scheduleError}
      onAvailability={canEditAvailability ? () => setView("availability") : undefined}
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
  onAction,
  onAvailability,
  onManuals,
  actionLabel,
  calendarMode = "month",
  rows,
  loading,
  scheduleError,
  authError = "",
  title = "スケジュールを確認する",
}: {
  onBack: () => void;
  onAction?: () => void;
  onAvailability?: () => void;
  onManuals: () => void;
  actionLabel?: string;
  calendarMode?: "month" | "details";
  rows: MemberScheduleRow[];
  loading: boolean;
  scheduleError: string;
  authError?: string;
  title?: string;
}) {
  return (
    <SimpleSchedulePage onBack={onBack} title={title}>
      <div
        className="scheduleCarouselViewport scheduleSlide-timeline"
        aria-live="polite"
        aria-label="日程"
      >
        <MemberScheduleCalendar
          rows={rows}
          loading={loading}
          error={scheduleError}
          mode={calendarMode}
          onDateClick={calendarMode === "month" ? onAction : undefined}
        />
      </div>

      {onAction && actionLabel && (
        <button
          type="button"
          className="scheduleAvailabilityEntry"
          onClick={onAction}
          aria-label={actionLabel}
        >
          {calendarMode === "month" ? <List aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
          <span>{actionLabel}</span>
        </button>
      )}
      {onAvailability && (
        <button
          type="button"
          className="scheduleAvailabilityAdd"
          onClick={onAvailability}
          aria-label="空き日程を選択する"
          title="空き日程を選択する"
        >
          <Plus aria-hidden="true" />
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

function MemberScheduleCalendar({
  rows,
  loading,
  error,
  mode,
  onDateClick,
}: {
  rows: MemberScheduleRow[];
  loading: boolean;
  error: string;
  mode: "month" | "details";
  onDateClick?: () => void;
}) {
  const calendarDays = useMemo(() => getCalendarDays(AVAILABILITY_MONTH), []);
  const [dialog, setDialog] = useState<{ group: GroupName | null; ids: string[] } | null>(null);
  const selfRows = rows.filter((row) => row.is_self && row.status === "available");
  const detailDates = [...new Set(
    rows.filter((row) => row.status === "available").map((row) => row.available_date),
  )].sort();

  useEffect(() => {
    if (mode !== "details") return;
    const date = window.sessionStorage.getItem("mononoke-selected-schedule-date");
    if (!date) return;
    window.setTimeout(() => document.getElementById(`schedule-day-${date}`)?.scrollIntoView({ block: "start" }), 0);
  }, [mode]);

  if (loading) return <ScheduleState icon="loading" message="スケジュールを読み込み中" />;
  if (error) return <ScheduleState message={error} />;

  return (
    <div className={`memberCalendarLayout memberCalendar-${mode}`}>
      {mode === "month" && <div className="memberMonthPanel">
        <div className="memberMonthHeading">
          <CalendarDays aria-hidden="true" />
          <strong>2026年8月</strong>
        </div>
        <div className="memberWeekdays">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="memberMonthGrid">
          {calendarDays.map((day) => {
            const dateKey = toDateKey(day);
            const inMonth = day.getMonth() === 7;
            const selfSchedule = selfRows.find((row) => row.available_date === dateKey);
            return (
              <button
                type="button"
                key={dateKey}
                className={`memberMonthDay ${inMonth ? "" : "outside"} ${selfSchedule ? "hasSchedule" : ""}`}
                onClick={() => {
                  if (!selfSchedule) return;
                  window.sessionStorage.setItem("mononoke-selected-schedule-date", dateKey);
                  onDateClick?.();
                }}
                disabled={!inMonth || !selfSchedule}
              >
                <span>{day.getDate()}</span>
                {selfSchedule && (
                  <i className="selfScheduleDot" style={{ "--group-color": groupColor(selfSchedule.group_name) } as React.CSSProperties} />
                )}
              </button>
            );
          })}
        </div>
      </div>}

      {mode === "details" && <div className="memberDetailsList">
        {detailDates.map((date) => (
          <article className="memberDetailDay" id={`schedule-day-${date}`} key={date}>
            <p>{formatJapaneseDateWithWeekday(date)} 13:30〜14:30</p>
            <div className="memberDetailGroups">
              {groupRows(rows.filter((row) => row.available_date === date && row.status === "available")).map(({ group, ids, isSelf }) => (
                <button type="button" className={`memberDetailGroup ${isSelf ? "self" : ""}`}
                  style={{ "--group-color": groupColor(group) } as React.CSSProperties}
                  onClick={() => setDialog({ group, ids })} key={group ?? "unset"}>
                  <i aria-hidden="true" /><span>{groupLabel(group)}</span>
                </button>
              ))}
            </div>
          </article>
        ))}
        {!detailDates.length && <p className="memberNoSchedule">参加する予定はまだありません</p>}
      </div>}
      {dialog && <div className="groupDialogBackdrop" role="presentation" onClick={() => setDialog(null)}>
        <section className="groupDialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="groupDialogClose" onClick={() => setDialog(null)} aria-label="閉じる"><X aria-hidden="true" /></button>
          <h2 id="group-dialog-title">{groupLabel(dialog.group)}</h2>
          <p>参加できる人のID</p>
          <div className="groupDialogIds">{dialog.ids.map((id) => <strong key={id}>{id}</strong>)}</div>
        </section>
      </div>}
    </div>
  );
}

function groupRows(rows: MemberScheduleRow[]) {
  const grouped = new Map<GroupName | null, { ids: string[]; isSelf: boolean }>();
  rows.forEach((row) => {
    const current = grouped.get(row.group_name) ?? { ids: [], isSelf: false };
    if (!current.ids.includes(row.id)) current.ids.push(row.id);
    current.isSelf ||= row.is_self;
    grouped.set(row.group_name, current);
  });
  return [...grouped.entries()]
    .map(([group, value]) => ({ group, ids: value.ids.sort(), isSelf: value.isSelf }))
    .sort((a, b) => groupOrder(a.group) - groupOrder(b.group));
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
  classmateToken = "",
  onBack,
  editingEnabled,
}: {
  client: SupabaseClient;
  classmateToken?: string;
  onBack: () => void;
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
      : { data: [], error: new Error("IDログイン情報がありません") };
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
  }, [classmateToken, client]);

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
      : { error: new Error("IDログイン情報がありません") };

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
        <p className="availabilityInstruction">8月18日〜31日のうち、13:30〜14:30に学校に来れる日を選んでください。なお、土休日は行いません。</p>
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
              const isOutsideSelectableRange =
                dateKey < AVAILABILITY_SELECTABLE_START || dateKey > AVAILABILITY_SELECTABLE_END;
              const isUnavailableDate = isWeekend || isOutsideSelectableRange;

              if (!inMonth) {
                return <div className="availabilityBlank" key={dateKey} role="gridcell" />;
              }

              return (
                <button
                  type="button"
                  key={dateKey}
                  className={`availabilityDay ${status ?? "unset"} ${isSunday ? "sunday" : ""} ${isSaturday ? "saturday" : ""} ${isOutsideSelectableRange ? "closedPeriod" : ""}`}
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

function parseDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatJapaneseDate(dateKey: string) {
  if (!dateKey) return "";
  const date = parseDate(dateKey);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatJapaneseDateWithWeekday(dateKey: string) {
  const date = parseDate(dateKey);
  return `${formatJapaneseDate(dateKey)}（${WEEKDAYS[date.getDay()]}）`;
}

function groupColor(group: GroupName | null) {
  if (!group) return "#8a8a8a";
  const colors: Record<GroupName, string> = {
    "Class-leader": "#ffffff",
    Layout: "#45d483",
    Gimmick: "#4e9cff",
    Decoration: "#a66bff",
    Gadget: "#ff5c61",
    Story: "#f3cf42",
    Signboard: "#ff9f43",
    Yokai: "#35c9b5",
  };
  return colors[group];
}

function groupLabel(group: GroupName | null) {
  if (!group) return "班未設定";
  const labels: Record<GroupName, string> = {
    "Class-leader": "クラス文化祭係",
    Layout: "レイアウト班",
    Gimmick: "ギミック班",
    Decoration: "装飾班",
    Gadget: "小道具制作班",
    Story: "物語班",
    Signboard: "看板ベース",
    Yokai: "妖怪ベース",
  };
  return labels[group];
}

function groupOrder(group: GroupName | null) {
  return ["Class-leader", "Layout", "Gimmick", "Decoration", "Gadget", "Story", "Signboard", "Yokai"].indexOf(group ?? "");
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
