import { getWorkerDB, db, type OfflineSite, type OfflineLight, type OfflineReplacement } from "./offline-db";
import { getOfflineUser } from "./offline-auth";

type SyncTableName = "sites" | "lights" | "replacements";
type SyncRecord = OfflineSite | OfflineLight | OfflineReplacement;

interface ApiResponse {
  _id?: string;
  data?: { _id: string };
  localId?: string;
}

interface ApiListResponse {
  data?: unknown[];
}

const getEndpoint = (table: SyncTableName): string => {
  if (table === "sites") return "/api/sites";
  if (table === "lights") return "/api/lights";
  return "/api/replacements";
};

const getUnsyncedRecords = async (table: SyncTableName, workerId: string): Promise<SyncRecord[]> => {
  const wdb = getWorkerDB(workerId);
  const all = (await wdb.table(table).toArray()) as SyncRecord[];
  return all.filter((r) => r.synced === false);
};

const syncTable = async (table: SyncTableName, workerId: string): Promise<void> => {
  const unsynced = await getUnsyncedRecords(table, workerId);
  if (unsynced.length === 0) return;
  const wdb = getWorkerDB(workerId);

  for (const item of unsynced) {
    try {
      const res = await fetch(getEndpoint(table), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        const saved = (await res.json()) as ApiResponse;
        const serverId = saved._id ?? saved.data?._id ?? saved.localId;
        if (serverId) {
          await wdb.table(table).update(item.localId, { synced: true, _id: serverId } as Partial<SyncRecord>);
        } else {
          await wdb.table(table).update(item.localId, { synced: true } as Partial<SyncRecord>);
        }
      }
    } catch (error) {
      console.log(`Sync failed for ${table} ${item.localId}`, error);
    }
  }
};

export const syncAll = async (): Promise<void> => {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  const workerId = getOfflineUser()?.workerId;
  if (!workerId) return;
  await syncTable("sites", workerId);
  await syncTable("lights", workerId);
  await syncTable("replacements", workerId);
};

const extractArray = (json: unknown): unknown[] => {
  if (Array.isArray(json)) return json;
  if (typeof json === "object" && json !== null) {
    const obj = json as ApiListResponse;
    if (Array.isArray(obj.data)) return obj.data;
  }
  return [];
};

export const fetchAndCache = async (): Promise<void> => {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  const workerId = getOfflineUser()?.workerId;
  if (!workerId) return;
  const wdb = getWorkerDB(workerId);

  try {
    const [sitesRes, lightsRes, replacementsRes] = await Promise.all([
      fetch("/api/sites"),
      fetch("/api/lights"),
      fetch("/api/replacements"),
    ]);

    if (sitesRes.ok) {
      const json: unknown = await sitesRes.json();
      const list = extractArray(json) as OfflineSite[];
      const toPut = list.filter((s) => Boolean(s.localId || s._id)).map((s) => ({ ...s, localId: s.localId || (s._id as string), synced: true }));
      if (toPut.length > 0) await wdb.sites.bulkPut(toPut);
      // also keep legacy global db for fallback reads
      await db.sites.bulkPut(toPut).catch(() => {});
    }
    if (lightsRes.ok) {
      const json: unknown = await lightsRes.json();
      const list = extractArray(json) as OfflineLight[];
      const toPut = list.filter((l) => Boolean(l.localId || l._id)).map((l) => ({ ...l, localId: l.localId || (l._id as string), synced: true }));
      if (toPut.length > 0) await wdb.lights.bulkPut(toPut);
      await db.lights.bulkPut(toPut).catch(() => {});
    }
    if (replacementsRes.ok) {
      const json: unknown = await replacementsRes.json();
      const list = extractArray(json) as OfflineReplacement[];
      const toPut = list.filter((r) => Boolean(r.localId || r._id)).map((r) => ({ ...r, localId: r.localId || (r._id as string), synced: true }));
      if (toPut.length > 0) await wdb.replacements.bulkPut(toPut);
      await db.replacements.bulkPut(toPut).catch(() => {});
    }
  } catch (error) {
    console.log("Fetch cache failed", error);
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void syncAll();
  });
}