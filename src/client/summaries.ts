// Cross-app summary contract for the /manage profile overview.
//
// This identity hub owns only users/sessions/passkeys — the expense, calendar,
// gearlist and roster data live in their own apps. The dashboard renders these
// typed summaries; today fetchSummaries() returns SAMPLE data so the design is
// visible end-to-end. To go live, flip SAMPLE=false and each app exposes
// `GET /manage/<app>/api/summary` returning the matching shape below.

export interface CalendarSummary {
  /** Upcoming events that have a gear page assigned — i.e. trips the troop is
   *  actually going on. Server filters to gear-page-bearing events. */
  upcomingTrips: { id: string; name: string; date: string }[];
}

export interface GearlistSummary {
  assignedPages: number;
  itemsToPack: number;
}

export interface ExpensesSummary {
  /** Net balance in cents from the member's perspective: >0 they owe, <0 the
   *  troop owes them, 0 settled. */
  balanceCents: number;
  currency: string;
}

export interface RosterSummary {
  memberCount: number;
  myPosition?: string;
}

export interface AppSummaries {
  // null = that app's summary couldn't be loaded / isn't wired yet. Each card
  // renders its own "not connected" state so one app can't blank the dashboard.
  calendar: CalendarSummary | null;
  gearlist: GearlistSummary | null;
  expenses: ExpensesSummary | null;
  roster: RosterSummary | null;
}

// Flip to false once the per-app summary endpoints exist; the live path below is
// already wired.
const SAMPLE = true;

const SAMPLE_SUMMARIES: AppSummaries = {
  calendar: {
    upcomingTrips: [
      { id: "evt-712", name: "Pinnacles Backpacking", date: "2026-07-12" },
      { id: "evt-803", name: "Summer Camp — Camp Royaneh", date: "2026-08-03" },
    ],
  },
  gearlist: { assignedPages: 2, itemsToPack: 6 },
  expenses: { balanceCents: 4500, currency: "USD" },
  roster: { memberCount: 42, myPosition: "Assistant Scoutmaster" },
};

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Load every app summary in parallel. Sample today; live fetch when wired. */
export async function fetchSummaries(): Promise<AppSummaries> {
  if (SAMPLE) return SAMPLE_SUMMARIES;
  const [calendar, gearlist, expenses, roster] = await Promise.all([
    getJSON<CalendarSummary>("/manage/calendar/api/summary"),
    getJSON<GearlistSummary>("/manage/gearlist/api/summary"),
    getJSON<ExpensesSummary>("/manage/expenses/api/summary"),
    getJSON<RosterSummary>("/manage/roster/api/summary"),
  ]);
  return { calendar, gearlist, expenses, roster };
}
