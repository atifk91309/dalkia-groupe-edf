"use client";
import Link from "next/link";
import Image from "next/image";
import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { getWorkerDB } from "@/lib/offline-db";
import { getWorkerId, getOfflineUser, refreshOfflineAuth } from "@/lib/offline-auth";

function useIsOnline(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("online", cb);
    window.addEventListener("offline", cb);
    return () => {
      window.removeEventListener("online", cb);
      window.removeEventListener("offline", cb);
    };
  }, []);
  const getSnapshot = useCallback(() => typeof window !== "undefined" ? window.navigator.onLine : true, []);
  const getServerSnapshot = useCallback(() => true, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);
  const [workerId, setWorkerId] = useState<string>("");
  const [userRole, setUserRole] = useState<"owner" | "worker">("worker");
  const [userName, setUserName] = useState<string>("");
  const isOnline = useIsOnline();
  const pathname = usePathname();

  const isActive = useCallback((href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }, [pathname]);

  const linkClass = (href: string) =>
    `p-2.5 rounded-lg transition text-[13px] ${isActive(href) ? "bg-teal-900 text-white font-bold" : "hover:bg-teal-700 text-white/80"}`;

  //eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHasMounted(true); }, []);

  useEffect(() => {
    if (!hasMounted || typeof window === "undefined") return;
    let mounted = true;
    const updateCount = async () => {
      try {
        const user = await getOfflineUser();
        const isOwner = user?.role === "owner";
        const wid = isOwner ? "" : ((await getWorkerId()) || user?.workerId || "local");
        if (mounted) {
          setUserRole(isOwner ? "owner" : "worker");
          setUserName(user?.name || user?.email || "");
          setWorkerId(isOwner ? user?.name || "Owner" : wid);
        }
        await refreshOfflineAuth();
        // only count pending for workers (owner has no workerDB)
        if (!isOwner) {
          const wdb = getWorkerDB(wid);
          const [s, l, r] = await Promise.all([
            wdb.sites.filter((x) => !x.synced).count(),
            wdb.lights.filter((x) => !x.synced).count(),
            wdb.replacements.filter((x) => !x.synced).count(),
          ]);
          if (mounted) setPendingCount(s + l + r);
        } else {
          if (mounted) setPendingCount(0);
        }
      } catch {}
    };
    void updateCount();
    const interval = window.setInterval(() => { void updateCount(); }, 8000);
    window.addEventListener("online", updateCount);
    window.addEventListener("focus", updateCount);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("online", updateCount);
      window.removeEventListener("focus", updateCount);
    };
  }, [hasMounted]);

  const closeMenu = useCallback(() => setOpen(false), []);
  const toggleMenu = useCallback(() => setOpen((p) => !p), []);
  const isOffline = hasMounted && !isOnline;

  const displayLabel = userRole === "owner" ? `Owner ${userName}` : `Worker ${workerId.slice(0, 8)}`;
  const shortLabel = userRole === "owner" ? "Owner" : workerId.slice(0, 4);

  return (
    <div className="min-h-dvh flex bg-gray-50">
      <div className="md:hidden fixed top-0 left-0 right-0 bg-[#0f766e] text-white p-3.5 flex justify-between items-center z-30 h-14 pt-[env(safe-area-inset-top)]">
        <h2 className="font-bold text-[13px] flex items-center gap-2" suppressHydrationWarning>
          <Image src="/icon-circle-180.png" unoptimized alt="Dalkia" width={24} height={24} className="w-6 h-6 rounded-full bg-white border" />
          DALKIA GROUPE eDF {shortLabel}
          {hasMounted && isOffline && <span className="text-[9px] bg-amber-500 px-1.5 py-0.5 rounded-full">OFFLINE</span>}
          {hasMounted && pendingCount > 0 && <span className="text-[9px] bg-blue-500 px-1.5 py-0.5 rounded-full">{pendingCount}</span>}
        </h2>
        <button type="button" onClick={toggleMenu} className="text-[20px] w-8 h-8 grid place-items-center" aria-label="Toggle menu">{open ? "✕" : "☰"}</button>
      </div>

      <aside className={`w-64 bg-[#0f766e] text-white p-5 flex flex-col z-40 fixed md:sticky top-0 left-0 h-dvh md:h-screen shrink-0 transition-transform duration-300 overflow-y-auto ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="md:hidden h-14 shrink-0" />
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Image src="/icon-circle-180.png" alt="Dalkia" width={36} height={36} unoptimized className="w-9 h-9 rounded-full bg-white border-2 border-white shadow-sm" />
            <div><h2 className="font-bold text-[14px] leading-tight">Dalkia GROUPE eDF</h2><p className="text-[10px] text-teal-200 -mt-0.5">{displayLabel}</p></div>
          </div>
          <p className="text-[10px] text-teal-100/70 pl-1">Lighting PWA • Offline Ready</p>
        </div>

        {hasMounted && pendingCount > 0 && (
          <div className="mb-4 bg-teal-900/50 border border-teal-600/50 text-teal-100 text-[11px] p-2 rounded-lg text-center" suppressHydrationWarning>
            {pendingCount} pending sync {isOffline ? "• offline" : ""} • {shortLabel}
          </div>
        )}

        <nav className="flex flex-col gap-1 flex-1">
          <Link href="/dashboard" onClick={closeMenu} className={linkClass("/dashboard")}>📊 Dashboard</Link>
          <div className="mt-3 mb-1 text-[10px] text-teal-200/60 font-bold tracking-widest pl-2">PROJECT SITES</div>
          <Link href="/dashboard/sites" onClick={closeMenu} className={linkClass("/dashboard/sites")}>🏢 Sites (Building / Street / School)</Link>
          <div className="mt-3 mb-1 text-[10px] text-teal-200/60 font-bold tracking-widest pl-2">STOCK</div>
          <Link href="/dashboard/lights" onClick={closeMenu} className={linkClass("/dashboard/lights")}>💡 Light Stock (8.9W)</Link>
          <div className="mt-3 mb-1 text-[10px] text-teal-200/60 font-bold tracking-widest pl-2">DAILY WORK</div>
          <Link href="/dashboard/replacements" onClick={closeMenu} className={linkClass("/dashboard/replacements")}>🔧 Replacement Reports</Link>
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-6" suppressHydrationWarning>
          <div className="text-[10px] text-teal-200/60 text-center">{hasMounted ? (isOnline ? `🟢 Online • ${displayLabel}` : "🟡 Offline Mode") : "🟢 Online"}</div>
          <Link href="/login" onClick={closeMenu} className="block bg-teal-900 hover:bg-black/20 p-2.5 rounded-lg text-center text-[13px] transition">Logout {shortLabel}</Link>
        </div>
      </aside>

      {open && <button type="button" aria-label="Close menu" onClick={closeMenu} className="fixed inset-0 bg-black/50 z-30 md:hidden" />}
      <main className="flex-1 min-w-0 min-h-dvh bg-gray-50 pt-14 md:pt-0">
        <div className="p-3 sm:p-5 w-full max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}