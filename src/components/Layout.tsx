import type { ReactNode } from "react";
import { NavItem } from "./NavItem";

const IconLogout = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

type LayoutProps = {
  children: ReactNode;
  isAdmin: boolean;
  sessionPending: boolean;
  userLabel?: string;
  onLogout: () => void;
  siteLogoUrl?: string | null;
};

export function Layout({
  children,
  isAdmin,
  sessionPending,
  userLabel,
  onLogout,
  siteLogoUrl,
}: LayoutProps) {
  return (
    <div className="depthui-shell min-h-screen px-4 py-6 text-(--depthui-text) sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="depthui-card depthui-shadow-card flex flex-wrap items-center justify-between gap-4 rounded-4xl px-4 py-3 text-sm font-semibold text-[#434343]">
          <div className="flex flex-1 flex-wrap gap-2 items-center">
            <img className="h-9" src="/logo.png" alt="App Logo" />
            {siteLogoUrl && (
              <>
                <div className="h-6 w-px bg-black/10 mx-2"></div>
                <img className="h-8 object-contain" src={siteLogoUrl} alt="Site Logo" />
              </>
            )}
          </div>

          <div className="order-last flex w-full items-center justify-center gap-2 sm:order-none sm:w-auto">
            {isAdmin && (
              <>
                <NavItem to="/dashboard" label="Dashboard" />
                <NavItem to="/sites" label="Sites" />
                <NavItem to="/admin" label="Manage Users" />
              </>
            )}
          </div>

          <div className="flex flex-1 justify-end">
            {!sessionPending && userLabel && (
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <div>
                  <div className="font-semibold text-[#1f1f1f]">{userLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  title="Keluar"
                  className="depthui-chip flex h-8 w-8 items-center justify-center rounded-full text-[#1f1f1f] transition hover:opacity-80"
                >
                  <IconLogout className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
