// React back-office entry. Mounted by the /manage SSR shell. The kit CSS must
// load in this order — fonts FIRST, then the --t10-* token theme — per
// @troop10rwc/ui's STYLE.md setup contract.
import "@troop10rwc/ui/fonts.css";
import "@troop10rwc/ui/theme.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, EmptyState, Icon } from "@troop10rwc/ui";
import { faUsers, faKey, faGear } from "@troop10rwc/ui/icons/solid";

interface Identity {
  name: string;
  role?: string;
}

/** The /manage shell embeds the signed-in identity as a JSON island so the
 *  client doesn't re-fetch it just to label the topbar. */
function readIdentity(): Identity {
  const el = document.getElementById("t10-identity");
  if (!el?.textContent) return { name: "Member" };
  try {
    return JSON.parse(el.textContent) as Identity;
  } catch {
    return { name: "Member" };
  }
}

function BackOffice() {
  const identity = readIdentity();
  return (
    <AppShell
      active="members"
      brand={{ badge: "T10", title: "Identity", subtitle: "Back Office · RWC" }}
      user={{ name: identity.name, role: identity.role }}
      title="Members"
      subtitle="Identity & access"
      nav={[
        {
          label: "Manage",
          items: [
            { id: "members", label: "Members", icon: <Icon icon={faUsers} />, href: "#/members" },
            { id: "passkeys", label: "Passkeys", icon: <Icon icon={faKey} />, href: "#/passkeys" },
            { id: "settings", label: "Settings", icon: <Icon icon={faGear} />, href: "#/settings" },
          ],
        },
      ]}
    >
      <EmptyState>
        Back-office scaffold is live. Build the first page here — default to a
        Model&nbsp;1 DataTable for the roster with a Model&nbsp;3 Drawer for
        per-member edits.
      </EmptyState>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <BackOffice />
    </StrictMode>,
  );
}
