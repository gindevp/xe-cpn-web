import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { canRead } from "@/lib/rbac";
import { MOBILE_BOTTOM_TABS } from "@/lib/mobile-tasks";

export function MobileBottomNav({
  onCreateOrder,
  onOpenMenu,
}: {
  onCreateOrder: () => void;
  onOpenMenu: () => void;
}) {
  const { session } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const tabs = MOBILE_BOTTOM_TABS.filter((tab) => {
    if (tab.action === "menu" || tab.action === "create-order") return true;
    if (tab.id === "tac-vu") return canRead(session?.role, "tac-vu");
    if (tab.screen) return canRead(session?.role, tab.screen);
    return true;
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Điều hướng mobile"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.to != null &&
            (pathname === tab.to || (tab.to !== "/" && pathname.startsWith(tab.to + "/")));
          const className = cn(
            "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
            active ? "text-primary" : "text-muted-foreground hover:text-foreground",
          );

          if (tab.action === "create-order") {
            return (
              <li key={tab.id} className="flex flex-1">
                <button type="button" onClick={onCreateOrder} className={className}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="truncate">{tab.label}</span>
                </button>
              </li>
            );
          }

          if (tab.action === "menu") {
            return (
              <li key={tab.id} className="flex flex-1">
                <button type="button" onClick={onOpenMenu} className={className}>
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{tab.label}</span>
                </button>
              </li>
            );
          }

          return (
            <li key={tab.id} className="flex flex-1">
              <Link to={tab.to as "/"} className={className}>
                <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
