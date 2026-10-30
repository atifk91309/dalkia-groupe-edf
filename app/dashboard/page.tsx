"use client";
import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { getWorkerDB, type OfflineSite, type OfflineLight, type OfflineReplacement } from "@/lib/offline-db";
import { getOfflineUser, getWorkerId, refreshOfflineAuth } from "@/lib/offline-auth";
import LightsDonut from "../components/LightsDonut";

type ReportItem = { count: number; totalInstalled: number };
type Reports = { today: ReportItem; month: ReportItem; year: ReportItem; all: ReportItem };
type TopItem = { _id: string; totalQty: number; count: number; siteName: string };

type ApiReport = {
  workerId: string;
  kpi: {
    sites: number;
    lights: number;
    replacements: number;
    totalNewLights: number;
    stockAvailable: number;
    stockInstalled: number;
    stockIn: number;
    stockDamage: number;
  };
  breakdown: { byContractor: { _id: string; totalLights: number; jobs: number }[]; bySite: { siteId: string; siteName: string; totalLights: number; jobs: number }[] };
  recent: OfflineReplacement[];
};

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

function BarChart({ reports }: { reports: Reports }) {
  const data = [
    { label: "Today", val: reports.today.totalInstalled, count: reports.today.count },
    { label: "Month", val: reports.month.totalInstalled, count: reports.month.count },
    { label: "Year", val: reports.year.totalInstalled, count: reports.year.count },
  ];
  const max = Math.max(1, ...data.map((d) => d.val));
  return (
    <div className="bg-white p-4 rounded-xl border mb-5">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-[13px]">📊 Lights Installed Chart</h3>
        <span className="text-[9px] flex items-center gap-1"><span className="w-2 h-2 bg-teal-600 rounded-full inline-block"></span> Installed</span>
      </div>
      <div className="flex items-end justify-around h-32 gap-2">
        {data.map((d) => {
          const h = Math.max(6, Math.round((d.val / max) * 90));
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end h-24">
                <div className="w-14 sm:w-20 rounded-t-lg bg-teal-600 flex items-end justify-center" style={{ height: `${h}%` }}>
                  <span className="text-[8px] text-white font-bold mb-1">{d.val > 0 ? d.val : ""}</span>
                </div>
              </div>
              <p className="text-[11px] font-bold">{d.label}</p>
              <p className="text-[9px] text-gray-400">{d.val} lights • {d.count} reports</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const isOnline = useIsOnline();
  const isOffline = !isOnline;
  const [sites, setSites] = useState<OfflineSite[]>([]);
  const [lights, setLights] = useState<OfflineLight[]>([]);
  const [recent, setRecent] = useState<OfflineReplacement[]>([]);
  const [reports, setReports] = useState<Reports>({ today: { count: 0, totalInstalled: 0 }, month: { count: 0, totalInstalled: 0 }, year: { count: 0, totalInstalled: 0 }, all: { count: 0, totalInstalled: 0 } });
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [topSites, setTopSites] = useState<TopItem[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [apiData, setApiData] = useState<ApiReport | null>(null);
  const [workerId, setWorkerId] = useState<string>("");
  const [userRole, setUserRole] = useState<"owner" | "worker">("worker");
  const [userName, setUserName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("dalkia_last_backup");
    //eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setLastBackup(saved);
  }, []);

  const doFullBackup = useCallback(async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const wid = workerId || (await getWorkerId());
      const wdb = getWorkerDB(wid);
      const [offlineSites, offlineLights, offlineReps] = await Promise.all([
        wdb.sites.toArray(),
        wdb.lights.toArray(),
        wdb.replacements.toArray(),
      ]);
      const backup = {
        version: "DALKIA-V4-WORKER",
        date: new Date().toISOString(),
        workerId: wid,
        project: "Dalkia GROUPE eDF - Lighting PSAB",
        totals: { sites: offlineSites.length, lights: offlineLights.length, replacements: offlineReps.length },
        data: { sites: offlineSites, lights: offlineLights, replacements: offlineReps },
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const fileName = `Dalkia-FULL-BACKUP-${wid}-${new Date().toISOString().slice(0, 10)}-${offlineSites.length}Sites-${offlineLights.length}Lights-${offlineReps.length}Reps.json`;

      let savedToUSB = false;
      const win = window as unknown as { showSaveFilePicker?: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> };
      if (typeof win.showSaveFilePicker === "function") {
        try {
          const handle = await win.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: "JSON Backup", accept: { "application/json": [".json"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          savedToUSB = true;
        } catch (err) {
          if ((err as Error).name === "AbortError") { setBackingUp(false); return; }
        }
      }
      if (!savedToUSB) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
      const nowStr = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
      localStorage.setItem("dalkia_last_backup", nowStr);
      setLastBackup(nowStr);
      alert(`✅ Dalkia Backup Saved!\nWorker: ${wid}\nFile: ${fileName}\n${savedToUSB ? "Location: USB" : "Location: Downloads"}`);
    } catch (e) {
      alert("Backup failed: " + (e as Error).message);
    } finally {
      setBackingUp(false);
    }
  }, [backingUp, workerId]);

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`Restore backup from ${file.name}? This will replace current worker data and push to Cloud.`)) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as { workerId?: string; data?: { sites?: Record<string, unknown>[]; lights?: Record<string, unknown>[]; replacements?: Record<string, unknown>[] } };
      const currentWid = workerId || (await getWorkerId());
      const backupWid = json.workerId;
      if (backupWid && backupWid !== currentWid) {
        if (!confirm(`Backup is for Worker ${String(backupWid).slice(0, 8)} but you are ${String(currentWid).slice(0, 8)}. Restore anyway?`)) return;
      }
      const d = (json.data ?? json) as { sites?: Record<string, unknown>[]; lights?: Record<string, unknown>[]; replacements?: Record<string, unknown>[] };
      
      const fix = (list: Record<string, unknown>[] | undefined) => {
        if (!list) return [];
        return list.map((item) => {
          const fallback = `restored_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const localId = (item.localId as string) || (item._id as string) || fallback;
          // REMOVE _id for create - let MongoDB create new one
          const { ...rest } = item as { _id?: string; localId?: string };
          return { ...rest, localId, workerId: currentWid, synced: false };
        });
      };

      const wdb = getWorkerDB(currentWid);
      await wdb.sites.clear();
      await wdb.lights.clear();
      await wdb.replacements.clear();
      
      const s = fix(d.sites);
      const l = fix(d.lights);
      const r = fix(d.replacements);
      
      if (s.length) await wdb.sites.bulkPut(s as unknown as OfflineSite[]);
      if (l.length) await wdb.lights.bulkPut(l as unknown as OfflineLight[]);
      if (r.length) await wdb.replacements.bulkPut(r as unknown as OfflineReplacement[]);

      // PUSH TO MONGODB VIA SINGLE /api/restore CALL
      let pushResult = "Offline only";
      try {
        const res = await fetch("/api/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { sites: s, lights: l, replacements: r } }),
          credentials: "include",
        });
        const j = await res.json();
        if (res.ok) {
          pushResult = `Cloud: ${j.sites} sites, ${j.lights} lights, ${j.replacements} reps`;
          // Now mark offline as synced=true so pending goes to 0
          await wdb.sites.bulkPut(s.map(x => ({ ...x, synced: true })) as unknown as OfflineSite[]);
          await wdb.lights.bulkPut(l.map(x => ({ ...x, synced: true })) as unknown as OfflineLight[]);
          await wdb.replacements.bulkPut(r.map(x => ({ ...x, synced: true })) as unknown as OfflineReplacement[]);
        } else {
          pushResult = `Cloud failed: ${j.error}`;
        }
      } catch (err) {
        console.log("Online push failed", err);
        pushResult = "Online failed - will sync later via Sync button";
      }

      alert(`✅ Restored!\nOffline: ${s.length} sites, ${l.length} lights, ${r.length} reps\n${pushResult}`);
      location.reload();
    } catch (err) {
      alert("Restore failed: " + (err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const user = await getOfflineUser();
        const isOwner = user?.role === "owner";
        const role = isOwner ? "owner" : "worker";
        setUserRole(role);
        setUserName(user?.name || user?.email || "");
        const wid = isOwner ? "" : ((await getWorkerId()) || user?.workerId || "local");
        setWorkerId(isOwner ? user?.name || "Owner" : wid);
        await refreshOfflineAuth();
        
        let serverReps: OfflineReplacement[] = [];
        let serverLights: OfflineLight[] = [];
        let serverSites: OfflineSite[] = [];

        if (typeof navigator !== "undefined" && navigator.onLine) {
          try {
            const [rRes, lRes, sRes] = await Promise.all([
              fetch("/api/reports?limit=20", { cache: "no-store", credentials: "include" }),
              fetch("/api/lights", { cache: "no-store", credentials: "include" }),
              fetch("/api/sites", { cache: "no-store", credentials: "include" }),
            ]);
            if (rRes.ok) {
              const rJson = await rRes.json();
              serverReps = (rJson.recent || rJson.replacements || rJson) as OfflineReplacement[];
              if (rJson.kpi) setApiData(rJson as ApiReport);
              else setApiData({ workerId: wid, kpi: { sites: 0, lights: 0, replacements: serverReps.length, totalNewLights: 0, stockAvailable: 0, stockInstalled: 0, stockIn: 0, stockDamage: 0 }, breakdown: { byContractor: [], bySite: [] }, recent: serverReps } as ApiReport);
            }
            if (lRes.ok) {
              const lJson = await lRes.json();
              serverLights = (lJson.lights || lJson) as OfflineLight[];
            }
            if (sRes.ok) {
              const sJson = await sRes.json();
              serverSites = (sJson.sites || sJson) as OfflineSite[];
            }
          } catch {}
        }

        let allSites = serverSites;
        let allLights = serverLights;
        let allReps = serverReps;

        if (!isOwner) {
          const wdb = getWorkerDB(wid || "local");
          const [localSites, localLights, localReps] = await Promise.all([
            wdb.sites.toArray(),
            wdb.lights.toArray(),
            wdb.replacements.toArray(),
          ]);
          if (allSites.length === 0) allSites = localSites;
          if (allLights.length === 0) allLights = localLights;
          if (allReps.length === 0) allReps = localReps;
          if (serverReps.length && wdb) {
            try { await wdb.replacements.bulkPut(serverReps.map(r => ({...r, workerId: wid})) as OfflineReplacement[]); } catch {}
          }
        }

        const sortedReps = [...allReps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setSites(allSites);
        setLights(allLights);
        setRecent(sortedReps.slice(0, 5));

        const now = new Date();
        const isToday = (d: Date) => d.toDateString() === now.toDateString();
        const isThisMonth = (d: Date) => d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        const isThisYear = (d: Date) => d.getFullYear() === now.getFullYear();

        const calc = (filter: (d: Date) => boolean) => {
          const f = allReps.filter((r) => filter(new Date(r.date)));
          return { count: f.length, totalInstalled: f.reduce((a, b) => a + (b.newTotalLights || 0), 0) };
        };

        setReports({
          today: calc(isToday),
          month: calc(isThisMonth),
          year: calc(isThisYear),
          all: { count: allReps.length, totalInstalled: allReps.reduce((a, b) => a + (b.newTotalLights || 0), 0) },
        });

        const pending = [...allSites, ...allLights, ...allReps].filter((x) => !x.synced).length;
        setPendingCount(pending);

        const map = new Map<string, TopItem>();
        allReps.forEach((r) => {
          const key = r.siteId || "unknown";
          const ex = map.get(key);
          if (ex) {
            ex.totalQty += r.newTotalLights || 0;
            ex.count += 1;
          } else {
            const site = allSites.find((s) => s.localId === r.siteId || s._id === r.siteId);
            map.set(key, { _id: key, totalQty: r.newTotalLights || 0, count: 1, siteName: site?.siteName || String(r.siteId).slice(0, 12) });
          }
        });
        setTopSites(Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty).slice(0, 6));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // FIXED KPI LOGIC - was using ?? which shows 0 even when offline has data
  const hasLocalLights = lights.length > 0;
  const hasLocalSites = sites.length > 0;

  const totalAvailable = hasLocalLights
    ? lights.reduce((a, b) => a + (b.stockAvailable || 0), 0)
    : (apiData?.kpi.stockAvailable ?? 0);

  const totalInstalled = reports.all.totalInstalled > 0
    ? reports.all.totalInstalled
    : (apiData?.kpi.totalNewLights ?? 0);

  const totalIn = hasLocalLights
    ? lights.reduce((a, b) => a + (b.stockIn || 0), 0)
    : (apiData?.kpi.stockIn ?? 0);

  const totalDamage = hasLocalLights
    ? lights.reduce((a, b) => a + (b.stockDamage || 0), 0)
    : (apiData?.kpi.stockDamage ?? 0);

  const effectiveSitesCount = hasLocalSites ? sites.length : (apiData?.kpi.sites ?? 0);
  const effectiveLightsTypes = hasLocalLights ? lights.length : (apiData?.kpi.lights ?? 0);

  const lowStock = lights.filter((l) => l.stockAvailable < 100);
  const lowStockWarning = lights.filter((l) => l.stockAvailable >= 100 && l.stockAvailable < 500);
  const isOwnerAll = userRole === "owner" && (apiData?.workerId === "all" || workerId === "Owner" || !workerId);

  if (loading) return <p className="p-8 text-center text-gray-400 text-[12px]">Loading Dalkia Dashboard...</p>;

  return (
    <div className="p-3 sm:p-6 md:p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-[12px] p-2.5 rounded-xl text-center">📶 Offline {userRole === "owner" ? `Owner ${userName}` : `Worker ${workerId.slice(0, 8)}`} • {pendingCount} pending sync</div>}
      {pendingCount > 0 && !isOffline && <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-[12px] p-2.5 rounded-xl text-center">{pendingCount} offline pending → will sync when online</div>}

      <div className="mb-4 bg-linear-to-r from-teal-600 to-emerald-700 text-white p-4 rounded-xl shadow-lg border border-teal-700">
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <div>
            <h2 className="font-bold text-[14px]">📦 Dalkia Full Backup — {userRole === "owner" ? `Owner ${userName}` : `Worker ${workerId.slice(0, 8)}`}</h2>
            <p className="text-[11px] opacity-90 mt-1">Sites + Lights Stock + Reports → USB Ready {apiData ? `• API Live: ${apiData.kpi.replacements} reports` : "• Offline Mode"}</p>
            <p className="text-[10px] opacity-75 mt-1">Last backup: {lastBackup || "Never"} • {sites.length} sites • {lights.length} lights</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => void doFullBackup()} disabled={backingUp} className="bg-white text-teal-700 px-4 py-2 rounded-full text-[11px] font-bold shadow disabled:opacity-50">{backingUp ? "Backing up..." : "📥 Full Backup"}</button>
            <button onClick={() => fileInputRef.current?.click()} className="bg-black/20 hover:bg-black/30 text-white border border-white/30 px-4 py-2 rounded-full text-[11px] font-bold">♻️ Restore</button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleRestore} className="hidden" />
      </div>

      <div className="flex items-center gap-2.5 mb-1">
        <Image src="/icon-circle-180.png" unoptimized alt="logo" width={36} height={36} className="w-9 h-9 rounded-full border-2 border-teal-700 shadow-sm" />
        <h1 className="text-[18px] sm:text-2xl font-bold">Dalkia GROUPE eDF - Lighting | {userRole === "owner" ? `Owner ${userName}` : workerId.slice(0, 8)}</h1>
      </div>
      <p className="text-[11px] text-teal-700 font-bold mb-1">PSAB • Street Light • Schools — Replacement Tracking</p>
      <p className="text-gray-400 mb-4 text-[11px]">{new Date().toLocaleDateString()} • {isOffline ? "Offline" : "Online"} • {apiData ? `API Synced ${userRole === "owner" ? "Owner" : `Worker ${apiData.workerId.slice(0, 8)}`}` : `Local Only ${userRole === "owner" ? "Owner" : workerId.slice(0, 8)}`}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-3">
        <div className="bg-white p-3 sm:p-5 rounded-xl border"><p className="text-gray-400 text-[10px]">Today Reports</p><p className="text-[16px] font-bold mt-1">{reports.today.count} reports</p><p className="text-[10px] text-gray-500 mt-1"><span className="text-teal-700 font-bold">{reports.today.totalInstalled} lights installed</span></p></div>
        <div className="bg-blue-50 border-blue-200 p-3 sm:p-5 rounded-xl border"><p className="text-blue-600 text-[10px] font-bold">Month Installed</p><p className="text-[16px] font-bold mt-1 text-blue-700">{reports.month.totalInstalled} lights</p><p className="text-[10px] text-gray-500 mt-1">{reports.month.count} reports</p></div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border"><p className="text-gray-400 text-[10px]">Total Sites</p><p className="text-[16px] font-bold mt-1">{effectiveSitesCount} Sites</p><p className="text-[10px] text-gray-500 mt-1">{sites.filter((s) => s.projectType === "BUILDING").length} Buildings • {sites.filter((s) => s.projectType === "STREET_LIGHT").length} Street</p></div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border"><p className="text-gray-400 text-[10px]">Stock Available</p><p className="text-[16px] font-bold mt-1">{totalAvailable} pcs</p><p className="text-[10px] text-gray-500 mt-1">Installed {totalInstalled} • Types {effectiveLightsTypes}</p></div>
      </div>

      <LightsDonut totalIn={totalIn} installed={totalInstalled} damaged={totalDamage} available={totalAvailable} isOwner={isOwnerAll} />

      <BarChart reports={reports} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
        <div className="bg-white p-3 sm:p-5 rounded-xl border"><p className="text-gray-400 text-[10px]">Year Installed</p><p className="text-[16px] font-bold mt-1">{reports.year.totalInstalled}</p><p className="text-[10px] text-gray-500 mt-1">{reports.year.count} reports</p></div>
        <div className="bg-green-50 border-green-200 p-3 sm:p-5 rounded-xl border"><p className="text-green-700 text-[10px] font-bold">All Time Installed</p><p className="text-[16px] font-bold mt-1 text-green-700">{reports.all.totalInstalled}</p><p className="text-[10px] text-gray-500 mt-1">{reports.all.count} reports total</p></div>
        <div className="bg-white p-3 sm:p-5 rounded-xl border"><p className="text-gray-400 text-[10px]">Sites</p><p className="text-[16px] font-bold mt-1">{sites.length} Sites</p><p className="text-[10px] text-gray-500 mt-1">Buildings + Streets</p><Link href="/dashboard/sites" className="text-[10px] text-teal-700 mt-2 inline-block font-bold">View Sites →</Link></div>
        <div className="bg-orange-50 border-orange-200 p-3 sm:p-5 rounded-xl border"><p className="text-orange-600 text-[10px] font-bold">Low Stock &lt;100</p><p className="text-[16px] font-bold mt-1 text-red-600">{lowStock.length}</p><p className="text-[10px] text-gray-500 mt-1">{lowStockWarning.length} warning &lt;500</p></div>
      </div>

      <div className="flex gap-2 mb-5">
        <Link href="/dashboard/sites" className="flex-1 bg-teal-600 text-white p-3 rounded-xl text-center font-bold text-[12px]">🏢 Add Site</Link>
        <Link href="/dashboard/lights" className="flex-1 bg-green-600 text-white p-3 rounded-xl text-center font-bold text-[12px]">💡 Add Stock</Link>
        <Link href="/dashboard/replacements" className="flex-1 bg-orange-600 text-white p-3 rounded-xl text-center font-bold text-[12px]">🔧 New Report</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-xl border">
          <h2 className="font-bold mb-3 text-[13px]">⚠️ Low Stock &lt;100: {lowStock.length} | &lt;500: {lowStockWarning.length}</h2>
          {[...lowStock, ...lowStockWarning].slice(0, 6).map((l) => (
            <div key={l.localId} className="flex justify-between py-2 border-b last:border-0 text-[12px]">
              <span>{l.lightName} <span className="text-[10px] text-gray-400">{l.wattage} • {l.modelNo}</span></span>
              <span className="font-bold text-orange-500">{l.stockAvailable} pcs left</span>
            </div>
          ))}
          {lowStock.length === 0 && lowStockWarning.length === 0 && <p className="text-[11px] text-gray-400 py-2">All stocked good 👍</p>}
        </div>

        <div className="bg-white p-3.5 rounded-xl border">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-bold text-[13px]">🔥 Top Sites by Installed</h2>
            <Link href="/dashboard/replacements" className="text-[10px] bg-teal-50 text-teal-600 px-2.5 py-1 rounded-full font-bold hover:bg-teal-100">View All →</Link>
          </div>
          {topSites.length === 0 ? <p className="text-[11px] text-gray-400 py-4 text-center">No reports yet</p> : (
            <div className="space-y-2">{topSites.map((s, i) => (
              <div key={s._id} className="flex justify-between items-center bg-gray-50 border rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-yellow-400" : i === 1 ? "bg-gray-300" : i === 2 ? "bg-orange-300" : "bg-white border"}`}>{i + 1}</span>
                  <div><p className="font-bold text-[11px] truncate max-w-32">{s.siteName}</p><p className="text-[9px] text-gray-500">{s.count} reports</p></div>
                </div>
                <div className="text-right"><p className="font-bold text-[11px] text-teal-700">{s.totalQty} lights</p></div>
              </div>
            ))}</div>
          )}

          <h2 className="font-bold mt-5 mb-3 text-[13px]">🕒 Recent Reports {apiData ? "• API" : ""}</h2>
          {(apiData?.recent.length ? apiData.recent : recent).slice(0, 5).map((r) => (
            <div key={r.localId || (r as { _id?: string })._id} className="flex justify-between py-2 border-b last:border-0 text-[12px]">
              <span className="flex-1 pr-2 truncate">{sites.find((s) => s.localId === r.siteId || s._id === r.siteId)?.siteName || String(r.siteId).slice(0, 15)} • {r.newWattageLabel}</span>
              <span className="text-right shrink-0 font-bold text-teal-700">{r.newTotalLights} pcs</span>
            </div>
          ))}
          {recent.length === 0 && !apiData?.recent.length && <p className="text-[12px] text-gray-400">No reports today</p>}
        </div>
      </div>
    </div>
  );
}