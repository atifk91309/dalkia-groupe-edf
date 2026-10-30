import Dexie, { type Table } from "dexie";

export interface OfflineSite {
  localId: string;
  projectType: string;
  projectName: string;
  siteNo: string;
  siteName: string;
  floor: string;
  roomNo: string;
  roomType: string;
  areaZone: string;
  locationName: string;
  city: string;
  streetName?: string;
  poleNo?: string;
  userId: string;
  workerId: string;
  site: string;
  synced: boolean;
  _id?: string;
}

export interface OfflineLight {
  localId: string;
  lightName: string;
  wattage: string;
  lightType: string;
  modelNo: string;
  brandModelFull: string;
  company: string;
  stockIn: number;
  stockDamage: number;
  stockInstalled: number;
  stockAvailable: number;
  userId: string;
  workerId: string;
  site: string;
  synced: boolean;
  _id?: string;
}

export interface OfflineReplacement {
  localId: string;
  date: Date;
  siteId: string;
  lightId: string;
  existingWattage: string;
  existingFixtureType: string;
  oldFixturesQty: number;
  oldLightsPerFixture: number;
  oldTotalLights: number;
  oldLampWattage: string;
  newFixturesQty: number;
  newLightsPerFixture: number;
  newTotalLights: number;
  newWattageLabel: string;
  typeOfReplacement: string;
  colorTemp: string;
  subContractor: string;
  manpower: number;
  lightingControl: string;
  sensorQty: number;
  controlledLightsQty: number;
  relayQty: number;
  remarks: string;
  remarkDate: string;
  userId: string;
  workerId: string;
  site: string;
  synced: boolean;
  _id?: string;
}

export interface OfflineUser {
  _id: string;
  email: string;
  name: string;
  workerId: string;
  site: string;
}

class LightingDB extends Dexie {
  sites!: Table<OfflineSite, string>;
  lights!: Table<OfflineLight, string>;
  replacements!: Table<OfflineReplacement, string>;
  users!: Table<OfflineUser, string>;

  constructor(name = "dalkia-lighting-pwa") {
    super(name);
    this.version(1).stores({
      sites: "localId, siteName, siteNo, projectType, projectName, synced, _id",
      lights: "localId, lightName, modelNo, wattage, synced, _id",
      replacements: "localId, siteId, lightId, date, synced, _id",
      users: "_id, email",
    });

    this.version(2).stores({
      sites: "localId, *siteName, *projectName, siteNo, projectType, city, userId, synced, _id",
      lights: "localId, *lightName, *modelNo, *brandModelFull, company, userId, synced, _id",
      replacements: "localId, siteId, lightId, date, userId, synced, _id",
      users: "_id, email",
    });

    this.version(3).stores({
      sites: "localId, *siteName, *projectName, siteNo, projectType, city, userId, workerId, site, [workerId+site], synced, _id",
      lights: "localId, *lightName, *modelNo, *brandModelFull, company, userId, workerId, site, [workerId+site], synced, _id",
      replacements: "localId, siteId, lightId, date, userId, workerId, site, [workerId+site], synced, _id",
      users: "_id, email, workerId, site",
    }).upgrade(tx => {
      return Promise.all([
        tx.table("sites").toCollection().modify((site: unknown) => {
          const s = site as OfflineSite;
          if (!s.workerId) s.workerId = s.userId || "local";
          if (!s.site) s.site = "Dalkia-Site";
        }),
        tx.table("lights").toCollection().modify((site: unknown) => {
          const s = site as OfflineLight;
          if (!s.workerId) s.workerId = s.userId || "local";
          if (!s.site) s.site = "Dalkia-Site";
        }),
        tx.table("replacements").toCollection().modify((site: unknown) => {
          const s = site as OfflineReplacement;
          if (!s.workerId) s.workerId = s.userId || "local";
          if (!s.site) s.site = "Dalkia-Site";
        }),
      ]);
    });
  }
}

export const db = new LightingDB();

export function getWorkerDB(workerId: string): LightingDB {
  const safeId = workerId?.replace(/[^a-zA-Z0-9_-]/g, "_") || "local";
  return new LightingDB(`DalkiaDB_${safeId}`);
}

export const generateLocalId = (): string => {
  return `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

type OfflineTableData = OfflineSite | OfflineLight | OfflineReplacement;

export const addToOffline = async <T extends OfflineTableData>(
  workerId: string,
  table: "sites" | "lights" | "replacements",
  data: T
): Promise<T> => {
  const wdb = getWorkerDB(workerId);
  const localId = data.localId || generateLocalId();
  const item = { ...data, localId, workerId, site: data.site || "Dalkia-Site", synced: false } as T;
  await wdb.table(table).put(item as unknown as OfflineSite);
  return item;
};

export const getWorkerSites = (workerId: string) => {
  return getWorkerDB(workerId).sites.where("workerId").equals(workerId).toArray();
};

export const getWorkerReplacementsBySite = (workerId: string, site: string) => {
  return getWorkerDB(workerId).replacements.where("[workerId+site]").equals([workerId, site]).toArray();
};

export const getWorkerLights = (workerId: string) => {
  return getWorkerDB(workerId).lights.where("workerId").equals(workerId).toArray();
};

export const getWorkerReplacements = (workerId: string) => {
  return getWorkerDB(workerId).replacements.where("workerId").equals(workerId).toArray();
};