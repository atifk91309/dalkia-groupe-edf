export interface CachedUser {
  _id: string;
  email: string;
  name: string;
  role: 'owner' | 'worker';
  workerId: string; // required now - matches User model
  site: string; // required now
  cachedAt: number;
}

const KEY = 'offline_user';
const WORKER_KEY = 'dalkia_workerId';
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;

export function cacheUserForOffline(user: { 
  _id: string; 
  email: string; 
  name: string; 
  role: 'owner' | 'worker';
  workerId: string;
  site: string;
}): void {
  if (typeof window === "undefined") return;
  const data: CachedUser = {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    workerId: user.workerId,
    site: user.site || 'Dalkia-Site',
    cachedAt: Date.now()
  };
  localStorage.setItem(KEY, JSON.stringify(data));
  try { localStorage.setItem(WORKER_KEY, data.workerId); } catch {}
}

export const saveOfflineUser = cacheUserForOffline;

export function getOfflineUser(): CachedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(KEY);
    if (!cached) return null;
    const user = JSON.parse(cached) as CachedUser;
    if (!user?._id || !user?.cachedAt || !user?.workerId) return null;
    
    if (Date.now() - user.cachedAt > ONE_YEAR) {
      localStorage.removeItem(KEY);
      try { localStorage.removeItem(WORKER_KEY); } catch {}
      return null;
    }

    // Permanent forever: refresh on every use -> 365 days rolling
    const refreshed: CachedUser = { ...user, cachedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(refreshed));
    return refreshed;
  } catch {
    return null;
  }
}

export function refreshOfflineAuth(): void {
  void getOfflineUser();
}

export function canLoginOffline(): boolean {
  return !!getOfflineUser();
}

export function clearOfflineUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  try { localStorage.removeItem(WORKER_KEY); } catch {}
}

export const clearOfflineAuth = clearOfflineUser;

export function getWorkerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const wid = localStorage.getItem(WORKER_KEY);
    if (wid) return wid;
  } catch {}
  const user = getOfflineUser();
  return user?.workerId || "";
}

export function isOfflineFirstReady(): boolean {
  return canLoginOffline();
}

export function isOfflineAuthValid(): boolean {
  return canLoginOffline();
}