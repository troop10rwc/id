// React back-office DASHBOARD entry — the apex launchpad. Mounted by the
// /dashboard SSR shell (src/dashboard/worker.ts) into <div id="root">. Uses the
// same @troop10rwc/ui AppShell as every other back-office page so the chrome
// (top bar, sidebar, tokens) stays identical. CSS order per STYLE.md: fonts
// FIRST, then the --t10-* token theme.
import "@troop10rwc/ui/fonts.css";
import "@troop10rwc/ui/theme.css";

import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  AppShell,
  BACK_OFFICE_APPS,
  BackOfficeTopNav,
  Icon,
  type IconDefinition,
  SectionLabel,
} from "@troop10rwc/ui";
import {
  faCalendarDays,
  faGaugeHigh,
  faReceipt,
  faTent,
  faUsers,
} from "@troop10rwc/ui/icons/solid";

interface Identity {
  name: string;
  /** Where "Sign out" goes — the member hub revokes the session there. */
  logoutUrl: string;
}

/** The SSR shell embeds the signed-in identity as a JSON island so the client
 *  labels the chrome without a fetch. */
function readIdentity(): Identity {
  const el = document.getElementById("t10-identity");
  const fallback: Identity = { name: "Member", logoutUrl: "/logout" };
  if (!el?.textContent) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(el.textContent) as Partial<Identity>) };
  } catch {
    return fallback;
  }
}

const APP_ICON: Record<string, IconDefinition> = {
  calendar: faCalendarDays,
  gearlist: faTent,
  expenses: faReceipt,
  roster: faUsers,
};

/** One-line description per app, keyed by BACK_OFFICE_APPS id. */
const APP_BLURB: Record<string, string> = {
  calendar: "Trips, meetings & deadlines",
  gearlist: "Pack & personal gear checklists",
  expenses: "Reimbursements & budgets",
  roster: "Members, patrols & positions",
};

/** A launchpad tile linking to a back-office app. Mirrors the AppCard styling on
 *  the /manage overview (t10-card + tokens) for a consistent look. */
function LaunchCard({ id, label, href }: { id: string; label: string; href: string }): ReactNode {
  return (
    <a
      className="t10-card"
      href={href}
      style={{ display: "flex", flexDirection: "column", gap: "var(--t10-s2)", textDecoration: "none", color: "inherit" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--t10-s2)" }}>
        <Icon icon={APP_ICON[id] ?? faGaugeHigh} aria-hidden />
        <span style={{ fontFamily: "var(--t10-font-display)", fontWeight: 700 }}>{label}</span>
      </div>
      <span className="t10-label" style={{ color: "var(--t10-ink-soft)" }}>
        {APP_BLURB[id] ?? "Open app"}
      </span>
    </a>
  );
}

function Dashboard() {
  const identity = readIdentity();
  // The dashboard is on the apex, where the apps also live, so BACK_OFFICE_APPS'
  // root-relative hrefs (/manage/<app>) resolve directly — no origin rewrite (the
  // member hub needs one because it's a different subdomain; this Worker doesn't).
  const apps = BACK_OFFICE_APPS;

  return (
    <AppShell
      active="dashboard"
      appSwitcher={
        // active="" — the dashboard isn't one of the apps, so none is highlighted.
        <BackOfficeTopNav active="" user={{ name: identity.name }} logoutUrl={identity.logoutUrl} />
      }
      title="Dashboard"
      subtitle="Your Troop 10 Redwood City back-office apps"
      nav={[
        {
          label: "Back office",
          items: [
            { id: "dashboard", label: "Dashboard", icon: <Icon icon={faGaugeHigh} />, href: "/dashboard" },
            ...apps.map((a) => ({
              id: a.id,
              label: a.label,
              icon: <Icon icon={APP_ICON[a.id] ?? faGaugeHigh} />,
              href: a.href,
            })),
          ],
        },
      ]}
    >
      <SectionLabel>Apps</SectionLabel>
      <div className="t10-cardgrid">
        {apps.map((a) => (
          <LaunchCard key={a.id} id={a.id} label={a.label} href={a.href} />
        ))}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Dashboard />
    </StrictMode>,
  );
}
