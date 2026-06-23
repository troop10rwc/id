// React back-office entry. Mounted by the /manage SSR shell. The kit CSS must
// load in this order — fonts FIRST, then the --t10-* token theme — per
// @troop10rwc/ui's STYLE.md setup contract.
import "@troop10rwc/ui/fonts.css";
import "@troop10rwc/ui/theme.css";

import { type ReactNode, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell,
  BACK_OFFICE_APPS,
  BackOfficeTopNav,
  EmptyState,
  Icon,
  type IconDefinition,
  SectionLabel,
  StatusPill,
  type StatusTone,
} from "@troop10rwc/ui";
import {
  faCalendarDays,
  faGaugeHigh,
  faKey,
  faReceipt,
  faTent,
  faUsers,
} from "@troop10rwc/ui/icons/solid";
import { type AppSummaries, fetchSummaries } from "./summaries.js";

interface Identity {
  name: string;
  /** Whether this member is an adult. Drives the adults-only Expenses card.
   *  Not yet provided by the hub (no role data) — defaults to showing it. */
  isAdult?: boolean;
  /** Origin where the back-office apps live (the apex). The kit's app hrefs are
   *  relative (/manage/<app>), but this hub is a different subdomain, so we
   *  prefix them to point at the apex. Empty → keep relative. */
  manageOrigin?: string;
}

/** The /manage shell embeds the signed-in identity as a JSON island so the
 *  client doesn't re-fetch it just to label the chrome. */
function readIdentity(): Identity {
  const el = document.getElementById("t10-identity");
  if (!el?.textContent) return { name: "Member" };
  try {
    return JSON.parse(el.textContent) as Identity;
  } catch {
    return { name: "Member" };
  }
}

const APP_ICON: Record<string, IconDefinition> = {
  calendar: faCalendarDays,
  gearlist: faTent,
  expenses: faReceipt,
  roster: faUsers,
};

const usd = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** A clickable summary tile linking to the owning app. */
function AppCard({
  id,
  label,
  href,
  pill,
  children,
}: {
  id: string;
  label: string;
  href: string;
  pill?: { tone: StatusTone; text: string };
  children: ReactNode;
}) {
  return (
    <a
      className="t10-card"
      href={href}
      style={{ display: "flex", flexDirection: "column", gap: "var(--t10-s2)", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--t10-s2)" }}>
        <Icon icon={APP_ICON[id] ?? faGaugeHigh} aria-hidden />
        <span style={{ fontFamily: "var(--t10-font-display)", fontWeight: 700 }}>{label}</span>
        {pill && (
          <span style={{ marginLeft: "auto" }}>
            <StatusPill tone={pill.tone}>{pill.text}</StatusPill>
          </span>
        )}
      </div>
      <div style={{ color: "var(--t10-ink-soft)" }}>{children}</div>
    </a>
  );
}

/** "Not wired yet / failed to load" body for a card whose summary is null. */
function NotConnected() {
  return <span className="t10-label" style={{ color: "var(--t10-ink-faint)" }}>Not connected</span>;
}

function cardBody(id: string, s: AppSummaries) {
  switch (id) {
    case "calendar": {
      const c = s.calendar;
      if (!c) return <NotConnected />;
      if (c.upcomingTrips.length === 0)
        return <span className="t10-label" style={{ color: "var(--t10-ink-faint)" }}>No upcoming trips</span>;
      return (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--t10-s1)" }}>
          {c.upcomingTrips.map((t) => (
            <li key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--t10-s2)" }}>
              <span>{t.name}</span>
              <span className="t10-num">{fmtDate(t.date)}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "gearlist": {
      const g = s.gearlist;
      if (!g) return <NotConnected />;
      return (
        <div style={{ display: "flex", gap: "var(--t10-s5)" }}>
          <Stat n={g.assignedPages} label="Gear pages" />
          <Stat n={g.itemsToPack} label="To pack" />
        </div>
      );
    }
    case "expenses": {
      const e = s.expenses;
      if (!e) return <NotConnected />;
      const owes = e.balanceCents > 0;
      return (
        <span
          className={`t10-num${owes ? " t10-amt--neg" : ""}`}
          style={{ fontSize: "var(--t10-fs-xl)", fontWeight: 700 }}
        >
          {usd(Math.abs(e.balanceCents), e.currency)}
        </span>
      );
    }
    case "roster": {
      const r = s.roster;
      if (!r) return <NotConnected />;
      return (
        <div style={{ display: "grid", gap: "var(--t10-s1)" }}>
          <Stat n={r.memberCount} label="Members" />
          {r.myPosition && (
            <span className="t10-label" style={{ color: "var(--t10-ink-faint)" }}>{r.myPosition}</span>
          )}
        </div>
      );
    }
    default:
      return <NotConnected />;
  }
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column" }}>
      <span className="t10-num" style={{ fontSize: "var(--t10-fs-lg)", fontWeight: 700 }}>{n}</span>
      <span className="t10-label" style={{ color: "var(--t10-ink-faint)" }}>{label}</span>
    </span>
  );
}

/** The headstrip pill that flags an app needing attention (e.g. money owed). */
function cardPill(id: string, s: AppSummaries): { tone: StatusTone; text: string } | undefined {
  if (id === "expenses" && s.expenses) {
    return s.expenses.balanceCents > 0
      ? { tone: "alert", text: "Owed" }
      : { tone: "ok", text: "Settled" };
  }
  if (id === "calendar" && s.calendar?.upcomingTrips.length) {
    return { tone: "info", text: `${s.calendar.upcomingTrips.length} trip${s.calendar.upcomingTrips.length > 1 ? "s" : ""}` };
  }
  return undefined;
}

function Overview() {
  const identity = readIdentity();
  const isAdult = identity.isAdult ?? true; // gates the Expenses card; defaults on
  const [summaries, setSummaries] = useState<AppSummaries | null>(null);

  useEffect(() => {
    let live = true;
    void fetchSummaries().then((s) => {
      if (live) setSummaries(s);
    });
    return () => {
      live = false;
    };
  }, []);

  // Make the cross-app links absolute to the apex (see Identity.manageOrigin).
  const base = identity.manageOrigin ?? "";
  const apps = BACK_OFFICE_APPS.map((a) => ({ ...a, href: `${base}${a.href}` }));
  // The top nav shows every app; the Expenses summary card is adults-only.
  const cardApps = apps.filter((a) => a.id !== "expenses" || isAdult);

  return (
    <AppShell
      active="overview"
      appSwitcher={
        <BackOfficeTopNav active="overview" apps={apps} user={{ name: identity.name }} logoutUrl="/logout" />
      }
      user={{ name: identity.name }}
      title="Profile"
      subtitle="Your activity across Troop 10 apps"
      nav={[
        {
          label: "Account",
          items: [
            { id: "overview", label: "Overview", icon: <Icon icon={faGaugeHigh} />, href: "/manage" },
            { id: "devices", label: "Passkeys & devices", icon: <Icon icon={faKey} />, href: "/profile" },
          ],
        },
      ]}
    >
      <SectionLabel>Managed apps</SectionLabel>
      {summaries === null ? (
        <EmptyState>Loading your summary…</EmptyState>
      ) : (
        <div className="t10-cardgrid">
          {cardApps.map((a) => (
            <AppCard key={a.id} id={a.id} label={a.label} href={a.href} pill={cardPill(a.id, summaries)}>
              {cardBody(a.id, summaries)}
            </AppCard>
          ))}
        </div>
      )}
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Overview />
    </StrictMode>,
  );
}
