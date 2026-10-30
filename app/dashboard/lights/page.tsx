"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import * as XLSX from "xlsx";
import { generateLocalId, type OfflineLight, getWorkerDB } from "@/lib/offline-db";
import { getOfflineUser, getWorkerId, refreshOfflineAuth } from "@/lib/offline-auth";

type LightForm = {
  lightName: string; wattage: string; lightType: string; modelNo: string;
  brandModelFull: string; company: string;
  stockIn: string; stockDamage: string;
};

type RemoteLight = OfflineLight & { _id?: string };

function unwrapArray(json: unknown): RemoteLight[] {
  if (Array.isArray(json)) return json as RemoteLight[];
  if (json && typeof json === "object" && "data" in json) {
    const obj = json as { data?: unknown };
    if (Array.isArray(obj.data)) return obj.data as RemoteLight[];
  }
  return [];
}

function LightsContent() {
  const [allLights, setAllLights] = useState<OfflineLight[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string>("");
  const LIMIT_STEP = 8;

  const [form, setForm] = useState<LightForm>({
    lightName: "", wattage: "", lightType: "", modelNo: "", brandModelFull: "", company: "",
    stockIn: "", stockDamage: "",
  });

  const load = useCallback(async () => {
    const user = await getOfflineUser();
    const wid = await getWorkerId() || user?.workerId || user?._id || "local";
    setWorkerId(wid);
    await refreshOfflineAuth();
    const wdb = getWorkerDB(wid);

    let local = await wdb.lights.orderBy("localId").reverse().toArray() as OfflineLight[];
if (local.length === 0 && typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const res = await fetch("/api/lights?limit=500", { cache: "no-store", credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const remote = unwrapArray(json);
          if (remote.length > 0) {
            const toPut: OfflineLight[] = remote.map((r) => ({
              localId: r.localId || r._id || generateLocalId(),
              lightName: r.lightName, wattage: r.wattage, lightType: r.lightType,
              modelNo: r.modelNo, brandModelFull: r.brandModelFull || `${r.modelNo} ${r.wattage}`,
              company: r.company, stockIn: r.stockIn, stockDamage: r.stockDamage || 0,
              stockInstalled: r.stockInstalled || 0,
              stockAvailable: r.stockAvailable ?? (r.stockIn - (r.stockDamage || 0) - (r.stockInstalled || 0)),
              userId: r.userId || wid, workerId: r.workerId || wid, site: r.site || user?.site || "Dalkia-Site",
              synced: true, _id: r._id,
            }));
            await wdb.lights.bulkPut(toPut);
            local = await wdb.lights.orderBy("localId").reverse().toArray() as OfflineLight[];
          }
        }
      } catch {}
    }
    setAllLights(local);
  }, []);

  //eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = search.trim()
    ? allLights.filter((l) => {
        const q = search.toLowerCase();
        return l.lightName.toLowerCase().includes(q) || l.modelNo.toLowerCase().includes(q) || (l.brandModelFull || "").toLowerCase().includes(q) || l.company.toLowerCase().includes(q);
      })
    : allLights;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const resetForm = () => {
    setForm({ lightName: "", wattage: "", lightType: "", modelNo: "", brandModelFull: "", company: "", stockIn: "", stockDamage: "" });
    setEditingId(null); setShowForm(false);
  };

  const save = async () => {
    if (!form.lightName.trim() || !form.modelNo.trim()) { alert("Light Name and Model required"); return; }
    const user = await getOfflineUser();
    const wid = workerId || await getWorkerId() || user?.workerId || "local";
    const wdb = getWorkerDB(wid);
    await refreshOfflineAuth();

    const stockInNum = form.stockIn === "" ? 0 : Number(form.stockIn);
    const stockDamageNum = form.stockDamage === "" ? 0 : Number(form.stockDamage);

    if (editingId) {
      const existing = await wdb.lights.get(editingId) as OfflineLight | undefined;
      if (!existing) return;
      const stockAvailable = Math.max(0, stockInNum - stockDamageNum - (existing.stockInstalled || 0));
      await wdb.lights.put({ ...existing, lightName: form.lightName.trim(), wattage: form.wattage.trim(), lightType: form.lightType.trim(), modelNo: form.modelNo.trim(), brandModelFull: form.brandModelFull.trim(), company: form.company.trim(), stockIn: stockInNum, stockDamage: stockDamageNum, stockAvailable, workerId: wid, site: user?.site || existing.site, synced: false });
      try {
        const apiId = existing._id || existing.localId;
        const res = await fetch(`/api/lights/${apiId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, stockIn: stockInNum, stockDamage: stockDamageNum, workerId: wid }), credentials: "include" });
        if (res.ok) { const saved = await res.json() as RemoteLight; await wdb.lights.update(editingId, { synced: true, _id: saved._id }); }
      } catch {}
      resetForm(); await load(); return;
    }

    const localId = generateLocalId();
    const data: OfflineLight = {
      localId, lightName: form.lightName.trim(), wattage: form.wattage.trim() || "8.9W", lightType: form.lightType.trim() || "Tube", modelNo: form.modelNo.trim(), brandModelFull: form.brandModelFull.trim(), company: form.company.trim() || "OSRAM",
      stockIn: stockInNum, stockDamage: stockDamageNum, stockInstalled: 0, stockAvailable: Math.max(0, stockInNum - stockDamageNum),
      userId: user?._id || wid, workerId: wid, site: user?.site || "Dalkia-Site", synced: false,
    };
    await wdb.lights.put(data);
    try {
      const res = await fetch("/api/lights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (res.ok) { const saved = await res.json() as { _id?: string }; await wdb.lights.update(localId, { synced: true, _id: saved._id }); }
    } catch {}
    resetForm(); setSearch(""); setVisibleCount(8); await load();
  };

  const startEdit = (l: OfflineLight) => {
    setEditingId(l.localId);
    setForm({ lightName: l.lightName, wattage: l.wattage, lightType: l.lightType, modelNo: l.modelNo, brandModelFull: l.brandModelFull || "", company: l.company, stockIn: String(l.stockIn), stockDamage: String(l.stockDamage || 0) });
    setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteLight = async (l: OfflineLight) => {
  if (!confirm(`Delete ${l.lightName} - ${l.modelNo}?`)) return;
  const wid = workerId || await getWorkerId() || l.workerId || "local";
  const wdb = getWorkerDB(wid);
  await wdb.lights.delete(l.localId);
  setAllLights(prev => prev.filter(x => x.localId !== l.localId));
  try { await fetch(`/api/lights/${l._id || l.localId}`, { method: "DELETE", credentials: "include" }); } catch {}
};

  const exportXLSX = () => {
    if (filtered.length === 0) { alert("No lights"); return; }
    const rows = filtered.map(l => ({ "Light Name": l.lightName, "Wattage": l.wattage, "Type": l.lightType, "Model No": l.modelNo, "Brand Full": l.brandModelFull, "Company": l.company, "Stock In": l.stockIn, "Damage": l.stockDamage || 0, "Installed": l.stockInstalled || 0, "Available": l.stockAvailable, "Worker": l.workerId }));
    const title = [[`DALKIA GROUPE eDF - Light Stock Report - Worker ${workerId}`], [`Generated: ${new Date().toLocaleString()} | Models: ${filtered.length} | Avl: ${filtered.reduce((s,x)=>s+x.stockAvailable,0)} pcs`], []];
    const ws = XLSX.utils.aoa_to_sheet(title); XLSX.utils.sheet_add_json(ws, rows, { origin: 3 });
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
    for (let C = range.s.c; C <= range.e.c; C++) { const addr = XLSX.utils.encode_cell({ r: 3, c: C }); if (ws[addr]) ws[addr].s = { font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "FFB6D7A8" } }, alignment: { horizontal: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } }; }
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: k.includes("Name") ? 22 : 13 }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Lights Stock");
    XLSX.writeFile(wb, `Dalkia-Lights-Stock-${workerId}-${new Date().toISOString().slice(0,10)}.xlsx`, { cellStyles: true } as never);
  };

  return (
    <div className="px-2 sm:px-0 max-w-[100vw] overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <h1 className="text-[14px] sm:text-[16px] font-bold">💡 Lights Stock - {filtered.length} | {workerId.slice(0,8)}</h1>
        <div className="flex gap-1.5 w-full sm:w-auto">
          <input value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(8); }} placeholder="Search ST8A / OSRAM" className="border p-2 rounded-full text-[11px] flex-1 sm:w-32 h-8" />
          <button onClick={exportXLSX} className="bg-green-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold h-8">📊 XLSX</button>
          <button onClick={() => { if (editingId) resetForm(); else setShowForm(!showForm); }} className="bg-green-600 text-white px-3 py-1 rounded-full text-[11px] font-bold h-8">{showForm ? "Close" : "+ Add"}</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-3 rounded-xl border mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="col-span-1 sm:col-span-2 text-[10px] font-bold text-blue-600">{editingId ? "✏️ Editing - Avl = In - Damage - Installed" : "➕ New Light"}</div>
          <input value={form.lightName} onChange={e => setForm({ ...form, lightName: e.target.value })} placeholder="LED Tube T8 120cm 8.9W" className="border p-2.5 rounded text-[12px] col-span-1 sm:col-span-2 h-9.5" />
          <input value={form.wattage} onChange={e => setForm({ ...form, wattage: e.target.value })} placeholder="8.9W" className="border p-2.5 rounded text-[12px] h-9.5" />
          <input value={form.lightType} onChange={e => setForm({ ...form, lightType: e.target.value })} placeholder="Tube / Bulb / Panel" className="border p-2.5 rounded text-[12px] h-9.5" />
          <input value={form.modelNo} onChange={e => setForm({ ...form, modelNo: e.target.value })} placeholder="ST8A-1.2M" className="border p-2.5 rounded text-[12px] h-9.5" />
          <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="OSRAM" className="border p-2.5 rounded text-[12px] h-9.5" />
          <input value={form.brandModelFull} onChange={e => setForm({ ...form, brandModelFull: e.target.value })} placeholder="ST8A-1.2M 8.9W/865 100-240V" className="border p-2.5 rounded text-[12px] col-span-1 sm:col-span-2 h-9.5" />
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.stockIn} onChange={e => setForm({ ...form, stockIn: e.target.value.replace(/[^0-9]/g, "") })} onFocus={e => e.target.select()} placeholder="Stock In (e.g. 5000)" className="border p-2.5 rounded text-[12px] bg-yellow-50 h-9.5" />
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={form.stockDamage} onChange={e => setForm({ ...form, stockDamage: e.target.value.replace(/[^0-9]/g, "") })} onFocus={e => e.target.select()} placeholder="Damage Qty (e.g. 0)" className="border p-2.5 rounded text-[12px] bg-red-50 h-9.5" />
          <button onClick={() => void save()} className="col-span-1 sm:col-span-2 bg-green-600 text-white p-3 rounded-lg font-bold text-[13px] h-10.5">{editingId ? "Update → Recalc Avl" : "Save Light Stock"}</button>
          {editingId && <button onClick={resetForm} className="col-span-1 sm:col-span-2 bg-gray-100 p-2.5 rounded text-[11px] h-9.5">Cancel</button>}
        </div>
      )}

      <div className="bg-white rounded-xl border divide-y">
        {visible.length === 0 ? <p className="p-4 text-[11px] text-gray-400 text-center">No lights</p> : visible.map(l => (
          <div key={l.localId} className="p-2.5 flex justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[11px] sm:text-[12px] truncate">{l.lightName} <span className="text-[8px] bg-green-50 text-green-700 px-1 py-0.5 rounded-full">{l.wattage}</span> {l.stockDamage > 0 && <span className="text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded-full ml-1">Damage {l.stockDamage}</span>}</p>
              <p className="text-[9px] sm:text-[10px] text-gray-500 truncate">{l.modelNo} • {l.company} • Avl {l.stockAvailable} / In {l.stockIn} • <span className={l.stockDamage > 0 ? "text-red-600 font-bold" : ""}>Damage {l.stockDamage || 0}</span> • Inst {l.stockInstalled || 0} {!l.synced && <span className="text-amber-600">• offline</span>}</p>
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${l.stockAvailable < 100 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{l.stockAvailable} left</span>
              <div className="flex gap-1">
                <button onClick={() => startEdit(l)} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold">Edit</button>
                <button onClick={() => void deleteLight(l)} className="text-[9px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold">Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {hasMore && <button onClick={() => setVisibleCount(c => c + LIMIT_STEP)} className="w-full mt-3 bg-white border p-3 rounded-xl font-bold text-[11px]">Load More ↓ {visible.length}/{filtered.length}</button>}
    </div>
  );
}

export default function LightsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-[11px] text-gray-400">Loading lights...</div>}>
      <LightsContent />
    </Suspense>
  );
}