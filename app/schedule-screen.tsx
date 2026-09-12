"use client";

// Keep this screen in the GitHub Pages static build.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CalendarDays, List, LoaderCircle, NotebookPen, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ScheduleScreenProps = {
  onBack: () => void;
  onWaiting: () => void;
  supabaseUrl: string;
  supabasePublishableKey: string;
  classmateToken?: string;
  classmateId?: string;
};

type AvailabilityStatus = "available" | "unavailable";
type AttendanceStatus = "arrived" | "left";

type AttendanceRow = {
  attendance_date: string;
  student_id: string;
  status: AttendanceStatus;
};

type AvailabilityRow = {
  available_date: string;
  status: AvailabilityStatus;
};

type MemberScheduleRow = {
  id: string;
  available_date: string;
  status: AvailabilityStatus;
  group_name: GroupName | null;
  base_name: BaseName | null;
  is_self: boolean;
};

type GroupName = "Class-leader" | "Layout" | "Gimmick" | "Decoration" | "Gadget" | "Story";
type BaseName = "Signboard" | "Yokai" | "PR";

type FestivalRole = "受付" | "スタッフ" | "チェックアウト" | "補欠";
type FestivalRoleKey = "reception" | "staff" | "checkout" | "backup";
type FestivalShift = {
  time: string;
  reception: string[];
  staff: string[];
  checkout: string[];
  backup: string[];
};

type FestivalAssignmentRow = {
  day: "sat" | "sun";
  slot: number;
  role: FestivalRoleKey;
  position: number;
  student_id: string;
};

type FestivalSnapshot = {
  ok: boolean;
  reason?: string;
  can_edit?: boolean;
  assignments?: FestivalAssignmentRow[];
};

type FestivalCandidateResponse = {
  ok: boolean;
  reason?: string;
  candidates?: string[];
};

type FestivalReassignResponse = {
  ok: boolean;
  reason?: string;
};

type FestivalMenu = {
  dayKey: "sat" | "sun";
  slot: number;
  time: string;
  role: FestivalRole;
  roleKey: FestivalRoleKey;
  position: number;
  currentId: string;
  left: number;
  top: number;
  placement: "above" | "below";
  candidates: string[];
  loading: boolean;
};

const FESTIVAL_SHIFTS = {
  土曜日: [
    { time: "10:25〜11:35", reception: ["2206", "2228"], staff: ["2216", "2222", "2224", "2225", "2226", "2227"], checkout: ["2218"], backup: [] },
    { time: "11:25〜12:35", reception: ["2222", "2231"], staff: ["2205", "2209", "2212", "2221", "2230", "2233"], checkout: ["2232"], backup: [] },
    { time: "12:55〜14:05", reception: ["2214", "2205"], staff: ["2218", "2219", "2203", "2221", "2227", "2228"], checkout: ["2212"], backup: [] },
    { time: "13:55〜15:05", reception: ["2213", "2230"], staff: ["2205", "2209", "2216", "2222", "2229", "2233"], checkout: ["2220"], backup: [] },
  ],
  日曜日: [
    { time: "9:25〜10:30", reception: ["2205", "2206"], staff: ["2207", "2214", "2219", "2222", "2224"], checkout: ["2225"], backup: ["2228", "2229"] },
    { time: "10:20〜11:25", reception: ["2218", "2227"], staff: ["2205", "2206", "2207", "2224", "2229"], checkout: ["2228"], backup: ["2225", "2226"] },
    { time: "11:15〜12:20", reception: ["2208", "2216"], staff: ["2207", "2213", "2218", "2219", "2225"], checkout: ["2214"], backup: ["2222", "2229"] },
    { time: "12:10〜13:15", reception: ["2213", "2230"], staff: ["2206", "2208", "2214", "2216", "2227"], checkout: ["2219"], backup: ["2207", "2222"] },
    { time: "13:05〜14:10", reception: ["2224", "2233"], staff: ["2206", "2213", "2218", "2225", "2230"], checkout: ["2227"], backup: ["2214", "2226"] },
    { time: "14:00〜15:00", reception: ["2203", "2220"], staff: ["2216", "2218", "2224", "2226", "2233"], checkout: ["2229"], backup: ["2219", "2228"] },
  ],
} satisfies Record<string, FestivalShift[]>;

type FestivalDay = keyof typeof FESTIVAL_SHIFTS;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const AVAILABILITY_MONTH = new Date(2026, 7, 1);
const AVAILABILITY_SELECTABLE_START = "2026-08-18";
const AVAILABILITY_SELECTABLE_END = "2026-08-31";
const MANUALS = [
  {
    title: "🟢レイアウト班",
    schedule: "8/26（水）～",
    description: "妖怪ベースが作成した妖怪のクイズをもとに各部屋の配置を決めます",
  },
  {
    title: "🔵ギミック班",
    schedule: "8/5（水）、8/26（水）～",
    description: "機械的なギミック（動くもの）を作ります",
  },
  {
    title: "🟣装飾班",
    schedule: "8/5（水）、8/6（木）、8/26（水）～",
    description: "モノを中心に部屋や通路の内装を考えます（一部妖怪の見た目を考えます）",
  },
  {
    title: "🔴小道具制作係",
    schedule: "8/26（水）～",
    description: "ヒトを中心にスタッフのアイテム・お面や妖怪の装飾をします（妖怪の装飾は装飾班と協力）",
  },
  {
    title: "🟡物語班",
    schedule: "～8/6（木）",
    description: "妖怪ベースが作成するにあたって各部屋のヘルプをします",
  },
  {
    title: "🟦妖怪ベース",
    schedule: "8/5（水）、8/6（木）",
    description: "妖怪にまつわるクイズを考えます",
    quizItems: ["01：人魂（ひとだま）", "02：かまいたち", "03：空亡（そらなき）またはぬえ"],
    notes: [
      "自分の01～03のわりあては詳細の予定→🟦妖怪ベースをタップすると確認できます",
      "不明点への対応、見た目のイメージ作り・確認についてはクラスLINEの「8/5（水）以降の全体の動き」を確認してください",
    ],
  },
] as const;
const YOKAI_TEAMS = [
  {
    label: "01：人魂（ひとだま）",
    ids: ["2201", "2205", "2206", "2208", "2212", "2214", "2223"],
  },
  {
    label: "02：かまいたち",
    ids: ["2209", "2215", "2216", "2217", "2218", "2221", "2229"],
  },
  {
    label: "03：空亡（そらなき）またはぬえ",
    ids: ["2202", "2204", "2227", "2228", "2231", "2232", "2233"],
  },
] as const;

export function ScheduleScreen({
  onBack,
  onWaiting,
  supabaseUrl,
  supabasePublishableKey,
  classmateToken = "",
  classmateId = "",
}: ScheduleScreenProps) {
  const [view, setView] = useState<"schedule" | "manuals">("schedule");
  const [festivalDay, setFestivalDay] = useState<FestivalDay>("土曜日");
  const client = useMemo(
    () =>
      supabaseUrl && supabasePublishableKey
        ? createClient(supabaseUrl, supabasePublishableKey, { auth: { persistSession: false } })
        : null,
    [supabasePublishableKey, supabaseUrl],
  );

  if (view === "manuals") {
    return <ManualList onBack={() => setView("schedule")} />;
  }

  return (
    <SimpleSchedulePage onBack={onBack} title="スケジュールを確認する">
      <FestivalSchedule
        day={festivalDay}
        onDayChange={setFestivalDay}
        classmateId={classmateId}
        classmateToken={classmateToken}
        client={client}
      />
      <button
        type="button"
        className="scheduleAvailabilityEntry scheduleReceptionEntry"
        onClick={onWaiting}
      >
        <List aria-hidden="true" />
        <span>受付のシステムを使う</span>
      </button>
      <button
        type="button"
        className="scheduleManualEntry"
        onClick={() => setView("manuals")}
      >
        <NotebookPen aria-hidden="true" />
        <span>マニュアル一覧</span>
      </button>
    </SimpleSchedulePage>
  );
}

function FestivalSchedule({
  day,
  onDayChange,
  classmateId,
  classmateToken,
  client,
}: {
  day: FestivalDay;
  onDayChange: (day: FestivalDay) => void;
  classmateId: string;
  classmateToken: string;
  client: SupabaseClient | null;
}) {
  const roleEntries: Array<{ role: FestivalRole; key: FestivalRoleKey }> = [
    { role: "受付", key: "reception" },
    { role: "スタッフ", key: "staff" },
    { role: "チェックアウト", key: "checkout" },
    ...(day === "日曜日" ? [{ role: "補欠" as const, key: "backup" as const }] : []),
  ];
  const [schedule, setSchedule] = useState<Record<FestivalDay, FestivalShift[]>>(() => cloneFestivalShifts());
  const [canEdit, setCanEdit] = useState(false);
  const [menu, setMenu] = useState<FestivalMenu | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const shifts = schedule[day];

  const loadSchedule = useCallback(async () => {
    if (!client || !classmateToken) return;

    const { data, error } = await client.rpc("festival_shift_snapshot", { p_token: classmateToken });
    if (error) return;

    const snapshot = data as FestivalSnapshot | null;
    if (!snapshot?.ok || !Array.isArray(snapshot.assignments)) return;

    setSchedule(applyFestivalAssignments(snapshot.assignments));
    setCanEdit(Boolean(snapshot.can_edit));
  }, [classmateToken, client]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadSchedule(), 0);
    const interval = window.setInterval(() => void loadSchedule(), 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadSchedule]);

  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  const openCandidateMenu = async (
    event: React.MouseEvent<HTMLButtonElement>,
    slot: number,
    time: string,
    role: FestivalRole,
    roleKey: FestivalRoleKey,
    position: number,
    currentId: string,
  ) => {
    if (!canEdit || !client || !classmateToken) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const placement = rect.top < 340 ? "below" : "above";
    const menuWidth = Math.min(390, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - menuWidth / 2 - 12, Math.max(menuWidth / 2 + 12, rect.left + rect.width / 2));
    const dayKey = day === "土曜日" ? "sat" : "sun";
    const nextMenu: FestivalMenu = {
      dayKey,
      slot,
      time,
      role,
      roleKey,
      position,
      currentId,
      left,
      top: placement === "below" ? rect.bottom + 10 : rect.top - 10,
      placement,
      candidates: [],
      loading: true,
    };
    setMenu(nextMenu);
    setStatus("");

    const { data, error } = await client.rpc("festival_shift_candidates", {
      p_token: classmateToken,
      p_day: dayKey,
      p_slot: slot,
    });
    const response = data as FestivalCandidateResponse | null;
    if (error || !response?.ok) {
      setMenu((current) => current ? { ...current, loading: false } : null);
      setStatus("候補を取得できませんでした。もう一度お試しください。");
      return;
    }
    setMenu((current) => current ? { ...current, loading: false, candidates: response.candidates ?? [] } : null);
  };

  const reassign = async (newStudentId: string) => {
    if (!menu || !client || saving) return;
    setSaving(true);
    const previousStudentId = menu.currentId;
    const { data, error } = await client.rpc("festival_shift_reassign", {
      p_token: classmateToken,
      p_day: menu.dayKey,
      p_slot: menu.slot,
      p_role: menu.roleKey,
      p_position: menu.position,
      p_new_student_id: newStudentId,
    });
    const response = data as FestivalReassignResponse | null;

    if (error || !response?.ok) {
      const message = response?.reason === "already_assigned"
        ? "その人は同じ時間の別の役割に入っています。最新の候補を確認してください。"
        : response?.reason === "ineligible"
          ? "その人は設定された条件に合いません。"
          : "変更できませんでした。もう一度お試しください。";
      setStatus(message);
      setMenu(null);
      setSaving(false);
      await loadSchedule();
      return;
    }

    setMenu(null);
    setStatus(`${previousStudentId}を${newStudentId}に変更しました。`);
    await loadSchedule();
    setSaving(false);
  };

  const ownAssignments = shifts.flatMap((shift) =>
    roleEntries
      .filter(({ key }) => shift[key].includes(classmateId))
      .map(({ role }) => `${shift.time} ${role}`),
  );

  return (
    <div className="festivalSchedule">
      <div className="festivalDayTabs" role="tablist" aria-label="文化祭の日程">
        {(Object.keys(FESTIVAL_SHIFTS) as FestivalDay[]).map((option) => (
          <button
            type="button"
            role="tab"
            aria-selected={day === option}
            className={day === option ? "active" : ""}
            onClick={() => onDayChange(option)}
            key={option}
          >
            {option}
          </button>
        ))}
      </div>

      {classmateId && (
        <p className="festivalOwnSummary">
          <strong>ID {classmateId}</strong>
          <span>{ownAssignments.length ? ownAssignments.join(" ／ ") : `${day}の担当はありません`}</span>
        </p>
      )}

      {canEdit && <p className="festivalEditHint">IDをタップすると、条件に合う交代候補を選べます。</p>}
      {status && <p className="festivalShiftStatus" role="status">{status}</p>}

      <div className="festivalTableScroll">
        <table className="festivalShiftTable">
          <thead>
            <tr>
              <th>時間</th>
              <th>受付（2人）</th>
              <th>スタッフ（{day === "日曜日" ? 5 : 6}人）</th>
              <th>チェックアウト（1人）</th>
              {day === "日曜日" && <th>補欠（2人）</th>}
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift, shiftIndex) => (
              <tr key={shift.time}>
                <th scope="row">{shift.time}</th>
                {roleEntries.map(({ role, key }) => (
                  <td data-role={role} key={key}>
                    {shift[key].map((id, positionIndex) => canEdit ? (
                      <button
                        type="button"
                        className={`festivalShiftId${id === classmateId ? " isSelf" : ""}`}
                        aria-label={`${day} ${shift.time} ${role}の${id}を交代する`}
                        onClick={(event) => void openCandidateMenu(event, shiftIndex + 1, shift.time, role, key, positionIndex + 1, id)}
                        key={`${key}-${positionIndex}`}
                      >
                        {id}
                      </button>
                    ) : (
                      <strong className={id === classmateId ? "isSelf" : ""} key={`${key}-${positionIndex}`}>{id}</strong>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="festivalHandoffNote">表示時刻には、前後5分の引き継ぎ・移動時間を含みます。</p>

      {menu && (
        <>
          <button
            type="button"
            className="festivalShiftMenuBackdrop"
            aria-label="交代候補を閉じる"
            onClick={() => setMenu(null)}
          />
          <div
            className={`festivalShiftMenu ${menu.placement}`}
            style={{ left: menu.left, top: menu.top }}
            role="dialog"
            aria-modal="true"
            aria-label={`${menu.currentId}の交代候補`}
          >
            <div className="festivalShiftMenuHeader">
              <div>
                <strong>{menu.currentId} の交代候補</strong>
                <span>{menu.time}・{menu.role}</span>
              </div>
              <button type="button" aria-label="閉じる" onClick={() => setMenu(null)}><X aria-hidden="true" /></button>
            </div>
            {menu.loading ? (
              <p className="festivalShiftMenuMessage"><LoaderCircle className="festivalShiftSpinner" aria-hidden="true" />候補を確認中…</p>
            ) : menu.candidates.length ? (
              <div className="festivalShiftCandidates">
                {menu.candidates.map((candidate) => (
                  <button type="button" disabled={saving} onClick={() => void reassign(candidate)} key={candidate}>
                    {candidate}
                  </button>
                ))}
              </div>
            ) : (
              <p className="festivalShiftMenuMessage">条件に合う候補はいません。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function cloneFestivalShifts(): Record<FestivalDay, FestivalShift[]> {
  return {
    土曜日: FESTIVAL_SHIFTS.土曜日.map((shift) => ({
      ...shift,
      reception: [...shift.reception],
      staff: [...shift.staff],
      checkout: [...shift.checkout],
      backup: [...shift.backup],
    })),
    日曜日: FESTIVAL_SHIFTS.日曜日.map((shift) => ({
      ...shift,
      reception: [...shift.reception],
      staff: [...shift.staff],
      checkout: [...shift.checkout],
      backup: [...shift.backup],
    })),
  };
}

function applyFestivalAssignments(assignments: FestivalAssignmentRow[]): Record<FestivalDay, FestivalShift[]> {
  const schedule = cloneFestivalShifts();
  for (const assignment of assignments) {
    const day = assignment.day === "sat" ? "土曜日" : assignment.day === "sun" ? "日曜日" : null;
    const shift = day ? schedule[day][assignment.slot - 1] : undefined;
    const ids = shift?.[assignment.role];
    if (!ids || assignment.position < 1 || assignment.position > ids.length) continue;
    ids[assignment.position - 1] = assignment.student_id;
  }
  return schedule;
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
  client,
  classmateToken,
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
  client: SupabaseClient | null;
  classmateToken: string;
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
          client={client}
          classmateToken={classmateToken}
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
  client,
  classmateToken,
  loading,
  error,
  mode,
  onDateClick,
}: {
  rows: MemberScheduleRow[];
  client: SupabaseClient | null;
  classmateToken: string;
  loading: boolean;
  error: string;
  mode: "month" | "details";
  onDateClick?: () => void;
}) {
  const calendarDays = useMemo(() => getCalendarDays(AVAILABILITY_MONTH), []);
  const [dialog, setDialog] = useState<{
    label: string;
    ids: string[];
    date: string;
    sections?: Array<{ label: string; ids: string[] }>;
  } | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceError, setAttendanceError] = useState("");
  const [savingAttendance, setSavingAttendance] = useState(false);
  const selfRows = rows.filter((row) => row.is_self && row.status === "available");
  const detailDates = [...new Set(
    rows.filter((row) => row.status === "available").map((row) => row.available_date),
  )].sort();

  useEffect(() => {
    if (!client || !classmateToken) return;
    let active = true;
    const loadAttendance = async () => {
      const result = await client.rpc("classmate_attendance", { p_token: classmateToken });
      if (!active) return;
      if (result.error) {
        setAttendanceError("登下校状況を読み込めませんでした。");
        return;
      }
      const next: Record<string, AttendanceStatus> = {};
      ((result.data ?? []) as AttendanceRow[]).forEach((row) => {
        next[`${row.attendance_date}:${row.student_id}`] = row.status;
      });
      setAttendance(next);
      setAttendanceError("");
    };
    void loadAttendance();
    return () => {
      active = false;
    };
  }, [classmateToken, client]);

  const advanceAttendance = async (date: string, id: string) => {
    if (!client || !classmateToken || savingAttendance || id !== rows.find((row) => row.is_self)?.id) return;
    if (date !== tokyoTodayKey()) return;
    setSavingAttendance(true);
    setAttendanceError("");
    const result = await client.rpc("advance_classmate_attendance", {
      p_token: classmateToken,
      p_date: date,
    });
    if (result.error) {
      setAttendanceError("登下校状況を保存できませんでした。");
    } else {
      setAttendance((current) => {
        const updated = { ...current };
        const key = `${date}:${id}`;
        if (result.data === null) delete updated[key];
        else updated[key] = result.data as AttendanceStatus;
        return updated;
      });
    }
    setSavingAttendance(false);
  };

  useEffect(() => {
    if (mode !== "details") return;
    const date = window.sessionStorage.getItem("mononoke-selected-schedule-date");
    if (!date) return;
    window.setTimeout(() => document.getElementById(`schedule-day-${date}`)?.scrollIntoView({ block: "start" }), 0);
  }, [mode]);

  if (loading) return <ScheduleState icon="loading" message="スケジュールを読み込み中" />;
  if (error) return <ScheduleState message={error} />;

  const renderDialogId = (id: string) => {
    if (!dialog) return null;
    const attendanceStatus = attendance[`${dialog.date}:${id}`];
    const isSelf = rows.some((row) => row.id === id && row.is_self);
    const canTap = isSelf && dialog.date === tokyoTodayKey();
    return canTap ? (
      <button
        type="button"
        key={id}
        className={`attendanceId ${attendanceStatus ?? ""}`}
        onClick={() => void advanceAttendance(dialog.date, id)}
        disabled={savingAttendance}
        aria-label={`${id}：${attendanceLabel(attendanceStatus)}`}
      >
        {id}
      </button>
    ) : (
      <strong key={id} className={`attendanceId ${attendanceStatus ?? ""}`}>{id}</strong>
    );
  };

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
                  <span className="selfScheduleMarkers" aria-label="所属">
                    {selfSchedule.group_name && (
                      <i className="selfScheduleDot groupMarker" style={{ "--group-color": groupColor(selfSchedule.group_name) } as React.CSSProperties} />
                    )}
                    {selfSchedule.base_name && (
                      <i className="selfScheduleDot baseMarker" style={{ "--group-color": baseColor(selfSchedule.base_name) } as React.CSSProperties} />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>}

      {mode === "details" && <div className="memberDetailsList">
        {detailDates.map((date) => (
          <article className="memberDetailDay" id={`schedule-day-${date}`} key={date}>
            <p>{formatJapaneseDateWithWeekday(date)} 14:00〜16:00</p>
            <div className="memberDetailGroups">
              {scheduleCategories(rows.filter((row) => row.available_date === date && row.status === "available")).map(({ kind, name, ids, isSelf }) => {
                const label = kind === "group" ? groupLabel(name as GroupName | null) : baseLabel(name as BaseName);
                const color = kind === "group" ? groupColor(name as GroupName | null) : baseColor(name as BaseName);
                return (
                  <button type="button" className={`memberDetailGroup ${kind}Marker ${isSelf ? "self" : ""}`}
                    style={{ "--group-color": color } as React.CSSProperties}
                    onClick={() => setDialog({
                      label,
                      ids,
                      date,
                      sections: kind === "base" && name === "Yokai" ? yokaiTeamSections(ids) : undefined,
                    })} key={`${kind}-${name ?? "unset"}`}>
                    <i aria-hidden="true" /><span>{label}</span>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
        {!detailDates.length && <p className="memberNoSchedule">参加する予定はまだありません</p>}
      </div>}
      {dialog && <div className="groupDialogBackdrop" role="presentation" onClick={() => setDialog(null)}>
        <section className="groupDialog" role="dialog" aria-modal="true" aria-labelledby="group-dialog-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="groupDialogClose" onClick={() => setDialog(null)} aria-label="閉じる"><X aria-hidden="true" /></button>
          <h2 id="group-dialog-title">{dialog.label}</h2>
          <p>参加できる人のID</p>
          {dialog.sections ? dialog.sections.map((section) => (
            <section key={section.label}>
              <p>{section.label}</p>
              <div className="groupDialogIds">{section.ids.map(renderDialogId)}</div>
            </section>
          )) : (
            <div className="groupDialogIds">{dialog.ids.map(renderDialogId)}</div>
          )}
          {attendanceError && <p className="attendanceError" role="alert">{attendanceError}</p>}
        </section>
      </div>}
    </div>
  );
}

function scheduleCategories(rows: MemberScheduleRow[]) {
  const categories = new Map<string, { kind: "group" | "base"; name: GroupName | BaseName | null; ids: string[]; isSelf: boolean }>();
  rows.forEach((row) => {
    const entries: Array<{ kind: "group" | "base"; name: GroupName | BaseName | null }> = [];
    if (row.group_name) entries.push({ kind: "group", name: row.group_name });
    if (row.base_name === "Yokai") entries.push({ kind: "base", name: row.base_name });
    entries.forEach(({ kind, name }) => {
      const key = `${kind}:${name ?? "unset"}`;
      const current = categories.get(key) ?? { kind, name, ids: [], isSelf: false };
      if (!current.ids.includes(row.id)) current.ids.push(row.id);
      current.isSelf ||= row.is_self;
      categories.set(key, current);
    });
  });
  return [...categories.values()]
    .map((value) => ({ ...value, ids: value.ids.sort() }))
    .sort((a, b) => categoryOrder(a.kind, a.name) - categoryOrder(b.kind, b.name));
}

function yokaiTeamSections(availableIds: string[]) {
  const availableIdSet = new Set(availableIds);
  return YOKAI_TEAMS
    .map((team) => ({
      label: team.label,
      ids: team.ids.filter((id) => availableIdSet.has(id)),
    }))
    .filter((team) => team.ids.length > 0);
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
          <details className="manualItem" key={manual.title}>
            <summary>{manual.title}</summary>
            <div className="manualBody">
              <p className="manualSchedule">{manual.schedule}</p>
              <p>{manual.description}</p>
              {"quizItems" in manual && (
                <ul className="manualQuizList">
                  {manual.quizItems.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
              {"notes" in manual && manual.notes.map((note) => (
                <p className="manualNote" key={note}>{note}</p>
              ))}
            </div>
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
        <p className="availabilityInstruction">8月18日〜31日のうち、14:00〜16:00に学校に来れる日を選んでください。なお、土休日は行いません。</p>
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
  };
  return labels[group];
}

function baseColor(base: BaseName) {
  return { Signboard: "#ff9f43", Yokai: "#35c9b5", PR: "#ff5c61" }[base];
}

function baseLabel(base: BaseName) {
  return base === "Yokai" ? "妖怪ベース" : "";
}

function categoryOrder(kind: "group" | "base", name: GroupName | BaseName | null) {
  const groups: Array<GroupName | null> = ["Class-leader", "Layout", "Gimmick", "Decoration", "Gadget", "Story", null];
  const bases: BaseName[] = ["Signboard", "Yokai", "PR"];
  return kind === "group" ? groups.indexOf(name as GroupName | null) : 100 + bases.indexOf(name as BaseName);
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

function tokyoTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function attendanceLabel(status?: AttendanceStatus) {
  if (status === "arrived") return "登校済み";
  if (status === "left") return "下校済み";
  return "未登録";
}

function statusLabel(status?: AvailabilityStatus) {
  if (status === "available") return "参加できる";
  if (status === "unavailable") return "参加できない";
  return "未回答";
}
