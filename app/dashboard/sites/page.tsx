"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import * as XLSX from "xlsx";
import { generateLocalId, type OfflineSite, getWorkerDB } from "@/lib/offline-db";
import { getOfflineUser, getWorkerId, refreshOfflineAuth } from "@/lib/offline-auth";

type SiteForm = {
  projectType: string; projectName: string; siteNo: string; siteName: string;
  floor: string; roomNo: string; roomType: string; areaZone: string;
  locationName: string; city: string; streetName: string; poleNo: string;
};

type RemoteSite = OfflineSite & { _id?: string };

function unwrapArray(json: unknown): RemoteSite[] {
  if (Array.isArray(json)) return json as RemoteSite[];
  if (json && typeof json === "object" && "data" in json) {
    const obj = json as { data?: unknown };
    if (Array.isArray(obj.data)) return obj.data as RemoteSite[];
  }
  return [];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="text-[9px] font-bold text-gray-600 ml-1">{label}</span>{children}</div>;
}

function SitesContent() {
  const [allSites, setAllSites] = useState<OfflineSite[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const [editingId, setEditingId] = useState<string | null>(null);
  const LIMIT_STEP = 8;
  const [workerId, setWorkerId] = useState<string>("");

  const [form, setForm] = useState<SiteForm>({
    projectType: "BUILDING", projectName: "PSAB", siteNo: "", siteName: "", floor: "FF",
    roomNo: "N/A", roomType: "Office Hall", areaZone: "", locationName: "PSAB", city: "Riyadh", streetName: "", poleNo: "",
  });

  const isStreet = form.projectType === "STREET_LIGHT";

  const load = useCallback(async () => {
  const user = await getOfflineUser();
  const wid = (await getWorkerId()) || user?.workerId || "local";
  setWorkerId(wid);
  await refreshOfflineAuth();
  const wdb = getWorkerDB(wid);

  let result = await wdb.sites.orderBy("localId").reverse().toArray() as OfflineSite[];
  
  if (result.length === 0 && typeof navigator !== "undefined" && navigator.onLine) {
    try {
      const res = await fetch("/api/sites?limit=500", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        const remote = unwrapArray(json);
        if (remote.length > 0) {
          const toPut: OfflineSite[] = remote.map((r) => ({
            localId: r.localId || r._id || generateLocalId(),
            projectType: r.projectType, projectName: r.projectName, siteNo: r.siteNo, siteName: r.siteName,
            floor: r.floor, roomNo: r.roomNo, roomType: r.roomType, areaZone: r.areaZone,
            locationName: r.locationName, city: r.city, streetName: r.streetName || "", poleNo: r.poleNo || "",
            userId: r.userId || wid, workerId: r.workerId || wid, site: r.site || user?.site || "Dalkia-Site",
            synced: true, _id: r._id,
          }));
          await wdb.sites.bulkPut(toPut);
          result = await wdb.sites.orderBy("localId").reverse().toArray() as OfflineSite[];
        }
      }
    } catch {}
  }
  setAllSites(result);
}, []);

  //eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = search.trim() ? allSites.filter(s => s.siteName.toLowerCase().includes(search.toLowerCase()) || s.siteNo.toLowerCase().includes(search.toLowerCase()) || s.city.toLowerCase().includes(search.toLowerCase())) : allSites;
  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const resetForm = () => {
    setForm({ projectType: "BUILDING", projectName: "PSAB", siteNo: "", siteName: "", floor: "FF", roomNo: "N/A", roomType: "Office Hall", areaZone: "", locationName: "PSAB", city: "Riyadh", streetName: "", poleNo: "" });
    setEditingId(null); setShowForm(false);
  };

  const save = async () => {
    if (!form.siteName.trim() || !form.siteNo.trim()) { alert("Site Name and Site No required"); return; }
    const user = await getOfflineUser();
    const wid = workerId || await getWorkerId() || user?.workerId || "local";
    const wdb = getWorkerDB(wid)
    await refreshOfflineAuth();

    const payload = {
      projectType: form.projectType, projectName: form.projectName, siteNo: form.siteNo.trim(), siteName: form.siteName.trim(),
      floor: isStreet ? "N/A" : form.floor, roomNo: form.roomNo, roomType: isStreet ? "Street Light" : form.roomType,
      areaZone: isStreet ? form.streetName : form.areaZone, locationName: form.locationName || "PSAB", city: form.city || "Riyadh",
      streetName: form.streetName || "", poleNo: form.poleNo || "", workerId: wid, site: user?.site || "Dalkia-Site",
    };

    if (editingId) {
      const existing = await wdb.sites.get(editingId) as OfflineSite | undefined;
      if (!existing) return;
      await wdb.sites.put({ ...existing, ...payload, synced: false });
      try {
        const apiId = existing._id || existing.localId;
        const res = await fetch(`/api/sites/${apiId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "include" });
        if (res.ok) { const saved = await res.json() as RemoteSite; await wdb.sites.update(editingId, { synced: true, _id: saved._id }); }
      } catch {}
      resetForm(); await load(); return;
    }

    const localId = generateLocalId();
    const data = { localId, ...payload, userId: user?._id || wid, synced: false } as OfflineSite;
    await wdb.sites.put(data);
    try {
      const res = await fetch("/api/sites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (res.ok) { const saved = await res.json() as { _id?: string }; await wdb.sites.update(localId, { synced: true, _id: saved._id }); }
    } catch {}
    resetForm(); setSearch(""); setVisibleCount(8); await load();
  };

  const startEdit = (s: OfflineSite) => {
    setEditingId(s.localId);
    setForm({ projectType: s.projectType, projectName: s.projectName, siteNo: s.siteNo, siteName: s.siteName, floor: s.floor, roomNo: s.roomNo, roomType: s.roomType, areaZone: s.areaZone, locationName: s.locationName, city: s.city, streetName: s.streetName || "", poleNo: s.poleNo || "" });
    setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSite = async (s: OfflineSite) => {
      if (!confirm(`Delete ${s.siteName} - ${s.siteNo}?`)) return;
      const wid = workerId || await getWorkerId() || s.workerId || "local";
      const wdb = getWorkerDB(wid);
      await wdb.sites.delete(s.localId);
      setAllSites(prev => prev.filter(x => x.localId !== s.localId));
      try { await fetch(`/api/sites/${s._id || s.localId}`, { method: "DELETE", credentials: "include" }); } catch {}
    };

  const exportXLSX = () => {
    if (filtered.length === 0) { alert("No sites"); return; }
    const rows = filtered.map(s => ({
      "Site Name": s.siteName, "Site No": s.siteNo, "Project Type": s.projectType, "Project Name": s.projectName,
      "Floor": s.floor, "Room No": s.roomNo, "Room Type": s.roomType, "Area/Zone": s.areaZone,
      "Location": s.locationName, "City": s.city, "Street Name": s.streetName || "", "Pole No": s.poleNo || "", "Worker": s.workerId || "", "Synced": s.synced ? "Yes" : "Offline"
    }));
    const title = [[`DALKIA GROUPE eDF - Sites Report - Worker ${workerId}`], [`Generated: ${new Date().toLocaleString()} | Total: ${filtered.length}`], []];
    const ws = XLSX.utils.aoa_to_sheet(title); XLSX.utils.sheet_add_json(ws, rows, { origin: 3 });
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
    for (let C = range.s.c; C <= range.e.c; C++) { const addr = XLSX.utils.encode_cell({ r: 3, c: C }); if (ws[addr]) ws[addr].s = { font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "FFB6D7A8" } }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } }; }
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: k.includes("Name") ? 20 : 13 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sites");
    XLSX.writeFile(wb, `Dalkia-Sites-${workerId}-${new Date().toISOString().slice(0,10)}.xlsx`, { cellStyles: true } as never);
  };

  return (
    <div className="px-2 sm:px-0 max-w-[100vw] overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <h1 className="text-[14px] sm:text-[16px] font-bold">🏢 Sites - {filtered.length} | {workerId.slice(0,8)}</h1>
        <div className="flex gap-1.5 w-full sm:w-auto">
          <input value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(8); }} placeholder="Search Building 82" className="border p-2 rounded-full text-[11px] flex-1 sm:w-32 h-8" />
          <button onClick={exportXLSX} className="bg-green-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold h-8">📊 XLSX</button>
          <button onClick={() => { if (editingId) resetForm(); else setShowForm(!showForm); }} className="bg-teal-600 text-white px-3 py-1 rounded-full text-[11px] font-bold h-8">{showForm ? "Close" : "+ Add"}</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-3 rounded-xl border mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="col-span-1 sm:col-span-2 text-[10px] font-bold text-blue-600">{editingId ? "✏️ Edit Site" : "➕ New Site"}</div>
          <Field label="Project Type"><select value={form.projectType} onChange={e => setForm({ ...form, projectType: e.target.value, streetName: "", poleNo: "" })} className="border p-2.5 rounded text-[12px] font-bold h-9.5">{["BUILDING","STREET_LIGHT","SCHOOL","COMPOUND","MOSQUE"].map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
          <Field label="Project Name"><input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} placeholder="PSAB" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Site No *"><input value={form.siteNo} onChange={e => setForm({ ...form, siteNo: e.target.value })} placeholder={isStreet ? "S-05" : "82"} className="border p-2.5 rounded text-[12px] bg-yellow-50 h-9.5" /></Field>
          <Field label="Site Name *"><input value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} placeholder={isStreet ? "Street Pole S-05" : "Building 82"} className="border p-2.5 rounded text-[12px] bg-yellow-50 h-9.5" /></Field>
          {isStreet ? (
            <>
              <Field label="Street Name *"><input value={form.streetName} onChange={e => setForm({ ...form, streetName: e.target.value })} placeholder="King Abdullah Road" className="border p-2.5 rounded text-[12px] bg-blue-50 font-bold h-9.5" /></Field>
              <Field label="Pole No *"><input value={form.poleNo} onChange={e => setForm({ ...form, poleNo: e.target.value })} placeholder="Pole S-05" className="border p-2.5 rounded text-[12px] bg-blue-50 font-bold h-9.5" /></Field>
              <Field label="Room / Pole ID"><input value={form.roomNo} onChange={e => setForm({ ...form, roomNo: e.target.value })} placeholder="S-05" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
              <Field label="City"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="border p-2.5 rounded text-[12px] bg-gray-50 h-9.5" /></Field>
            </>
          ) : (
            <>
              <Field label="Floor"><input value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} placeholder="FF / GF" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
              <Field label="Room No"><input value={form.roomNo} onChange={e => setForm({ ...form, roomNo: e.target.value })} placeholder="N/A" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
              <Field label="Room Type"><input value={form.roomType} onChange={e => setForm({ ...form, roomType: e.target.value })} placeholder="Office Hall / Corridor" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
              <Field label="Area / Zone"><input value={form.areaZone} onChange={e => setForm({ ...form, areaZone: e.target.value })} placeholder="Zone A" className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
            </>
          )}
          <Field label="Location Name"><input value={form.locationName} onChange={e => setForm({ ...form, locationName: e.target.value })} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          {!isStreet && <Field label="City"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="border p-2.5 rounded text-[12px] bg-gray-50 font-bold h-9.5" /></Field>}
          <button onClick={() => void save()} className="col-span-1 sm:col-span-2 bg-teal-600 text-white p-3 rounded-lg font-bold text-[13px] h-10.5 mt-1">{editingId ? "Update Site" : "Save Site"}</button>
          {editingId && <button onClick={resetForm} className="col-span-1 sm:col-span-2 bg-gray-100 p-2.5 rounded text-[11px] h-9.5">Cancel Edit</button>}
        </div>
      )}

      <div className="bg-white rounded-xl border divide-y overflow-hidden">
        {visible.length === 0 ? <p className="p-4 text-[11px] text-gray-400 text-center">No sites</p> : visible.map(s => (
          <div key={s.localId} className="p-2.5 flex justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[11px] sm:text-[12px] truncate">{s.siteName} <span className="text-[8px] bg-teal-50 text-teal-700 px-1 py-0.5 rounded-full">{s.projectType}</span></p>
              <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">{s.siteNo} • {s.floor} • {s.roomType} • {s.city} {s.streetName ? `• ${s.streetName} ${s.poleNo}` : ''} {!s.synced && <span className="text-amber-600">• offline</span>}</p>
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <div className="flex gap-1">
                <button onClick={() => startEdit(s)} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold">Edit</button>
                <button onClick={() => void deleteSite(s)} className="text-[9px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold">Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && <button onClick={() => setVisibleCount(c => c + LIMIT_STEP)} className="w-full mt-3 bg-white border p-3 rounded-xl font-bold text-[11px]">Load More ↓ {visible.length}/{filtered.length}</button>}
    </div>
  );
}

export default function SitesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-[11px] text-gray-400">Loading sites...</div>}>
      <SitesContent />
    </Suspense>
  );
}