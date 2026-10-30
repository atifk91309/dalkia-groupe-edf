"use client";
import { useEffect, useState, useCallback, Suspense } from "react";
import * as XLSX from "xlsx";
import { generateLocalId, type OfflineSite, type OfflineLight, type OfflineReplacement, getWorkerDB } from "@/lib/offline-db";
import { getOfflineUser, getWorkerId, refreshOfflineAuth } from "@/lib/offline-auth";

type ReplacementForm = {
  siteId: string; lightId: string; date: string;
  existingWattage: string; existingFixtureType: string;
  oldFixturesQty: string; oldLightsPerFixture: string; oldLampWattage: string;
  newFixturesQty: string; newLightsPerFixture: string; newWattageLabel: string;
  typeOfReplacement: string; colorTemp: string; subContractor: string; manpower: string;
  lightingControl: string; sensorQty: string; controlledLightsQty: string; relayQty: string;
  remarks: string; remarkDate: string;
};

type RemoteRep = OfflineReplacement & { _id?: string; siteLocalId?: string; lightLocalId?: string };
type RemoteSite = OfflineSite & { _id?: string };
type RemoteLight = OfflineLight & { _id?: string };

function unwrapArray<T>(json: unknown): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object" && "data" in json) {
    const obj = json as { data?: unknown };
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="text-[9px] font-bold text-gray-600 ml-1">{label}</span>{children}</div>;
}

function ReplacementsContent() {
  const [sites, setSites] = useState<OfflineSite[]>([]);
  const [lights, setLights] = useState<OfflineLight[]>([]);
  const [allReps, setAllReps] = useState<OfflineReplacement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string>("");
  const LIMIT_STEP = 8;

  const [form, setForm] = useState<ReplacementForm>({
    siteId: "", lightId: "", date: new Date().toISOString().slice(0,10),
    existingWattage: "4X40", existingFixtureType: "T8-120cm 40W",
    oldFixturesQty: "5", oldLightsPerFixture: "4", oldLampWattage: "40",
    newFixturesQty: "5", newLightsPerFixture: "4", newWattageLabel: "4X8.9",
    typeOfReplacement: "Tube", colorTemp: "6500k", subContractor: "Ettiqa",
    manpower: "5", lightingControl: "No", sensorQty: "0", controlledLightsQty: "0", relayQty: "0",
    remarks: "", remarkDate: "",
  });

  const loadAll = useCallback(async () => {
    const user = await getOfflineUser();
    const wid = await getWorkerId() || user?.workerId || user?._id || "local";
    setWorkerId(wid);
    await refreshOfflineAuth();
    const wdb = getWorkerDB(wid);

    let s = await wdb.sites.toArray() as OfflineSite[];
    let l = await wdb.lights.toArray() as OfflineLight[];
    let r = await wdb.replacements.orderBy("date").reverse().toArray() as OfflineReplacement[];
    
    if ((s.length === 0 || l.length === 0 || r.length === 0) && typeof navigator !== "undefined" && navigator.onLine) {
      try {
        const [resSites, resLights, resReps] = await Promise.all([
          fetch("/api/sites?limit=500", { cache: "no-store", credentials: "include" }),
          fetch("/api/lights?limit=500", { cache: "no-store", credentials: "include" }),
          fetch("/api/replacements?limit=500", { cache: "no-store", credentials: "include" }),
        ]);
        if (resSites.ok && s.length === 0) {
          const remote = unwrapArray<RemoteSite>(await resSites.json());
          if (remote.length > 0) {
            await wdb.sites.bulkPut(remote.map(x => ({
              localId: x.localId || x._id || generateLocalId(),
              projectType: x.projectType, projectName: x.projectName, siteNo: x.siteNo, siteName: x.siteName,
              floor: x.floor, roomNo: x.roomNo, roomType: x.roomType, areaZone: x.areaZone,
              locationName: x.locationName, city: x.city, streetName: x.streetName || "", poleNo: x.poleNo || "",
              userId: x.userId || wid, workerId: x.workerId || wid, site: x.site || user?.site || "Dalkia-Site",
              synced: true, _id: x._id
            })));
            s = await wdb.sites.toArray() as OfflineSite[];
          }
        }
        if (resLights.ok && l.length === 0) {
          const remote = unwrapArray<RemoteLight>(await resLights.json());
          if (remote.length > 0) {
            await wdb.lights.bulkPut(remote.map(x => ({
              localId: x.localId || x._id || generateLocalId(),
              lightName: x.lightName, wattage: x.wattage, lightType: x.lightType, modelNo: x.modelNo,
              brandModelFull: x.brandModelFull, company: x.company,
              stockIn: x.stockIn, stockDamage: x.stockDamage || 0, stockInstalled: x.stockInstalled || 0,
              stockAvailable: x.stockAvailable ?? x.stockIn,
              userId: x.userId || wid, workerId: x.workerId || wid, site: x.site || user?.site || "Dalkia-Site",
              synced: true, _id: x._id
            })));
            l = await wdb.lights.toArray() as OfflineLight[];
          }
        }
        if (resReps.ok && r.length === 0) {
          const remote = unwrapArray<RemoteRep>(await resReps.json());
          if (remote.length > 0) {
            await wdb.replacements.bulkPut(remote.map(x => ({
              localId: x.localId || x._id || generateLocalId(),
              date: new Date(x.date), siteId: x.siteId, lightId: x.lightId,
              existingWattage: x.existingWattage, existingFixtureType: x.existingFixtureType,
              oldFixturesQty: x.oldFixturesQty, oldLightsPerFixture: x.oldLightsPerFixture,
              oldTotalLights: x.oldTotalLights, oldLampWattage: x.oldLampWattage,
              newFixturesQty: x.newFixturesQty, newLightsPerFixture: x.newLightsPerFixture,
              newTotalLights: x.newTotalLights, newWattageLabel: x.newWattageLabel,
              typeOfReplacement: x.typeOfReplacement, colorTemp: x.colorTemp, subContractor: x.subContractor,
              manpower: x.manpower, lightingControl: x.lightingControl, sensorQty: x.sensorQty,
              controlledLightsQty: x.controlledLightsQty, relayQty: x.relayQty,
              remarks: x.remarks, remarkDate: x.remarkDate,
              userId: x.userId || wid, workerId: x.workerId || wid, site: x.site || user?.site || "Dalkia-Site",
              synced: true, _id: x._id
            })));
            r = await wdb.replacements.orderBy("date").reverse().toArray() as OfflineReplacement[];
          }
        }
      } catch {}
    }
    setSites(s); setLights(l); setAllReps(r);
  }, []);

  //eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, [loadAll]);

  const filtered = search.trim() ? allReps.filter(r => {
    const q = search.toLowerCase();
    const site = sites.find(s => s.localId === r.siteId || s._id === r.siteId);
    const light = lights.find(l => l.localId === r.lightId || l._id === r.lightId);
    return (
      r.newWattageLabel.toLowerCase().includes(q) ||
      r.existingWattage.toLowerCase().includes(q) ||
      r.subContractor.toLowerCase().includes(q) ||
      r.remarks.toLowerCase().includes(q) ||
      r.typeOfReplacement.toLowerCase().includes(q) ||
      (site?.siteName || "").toLowerCase().includes(q) ||
      (site?.siteNo || "").toLowerCase().includes(q) ||
      (site?.city || "").toLowerCase().includes(q) ||
      (light?.modelNo || "").toLowerCase().includes(q) ||
      (light?.lightName || "").toLowerCase().includes(q)
    );
  }) : allReps;

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;
  const oldTotal = (Number(form.oldFixturesQty)||0) * (Number(form.oldLightsPerFixture)||0);
  const newTotal = (Number(form.newFixturesQty)||0) * (Number(form.newLightsPerFixture)||0);

  const resetForm = () => {
    setForm({ siteId: "", lightId: "", date: new Date().toISOString().slice(0,10), existingWattage: "4X40", existingFixtureType: "T8-120cm 40W", oldFixturesQty: "5", oldLightsPerFixture: "4", oldLampWattage: "40", newFixturesQty: "5", newLightsPerFixture: "4", newWattageLabel: "4X8.9", typeOfReplacement: "Tube", colorTemp: "6500k", subContractor: "Ettiqa", manpower: "5", lightingControl: "No", sensorQty: "0", controlledLightsQty: "0", relayQty: "0", remarks: "", remarkDate: "" });
    setEditingId(null); setShowForm(false);
  };

  const save = async () => {
    if (!form.siteId || !form.lightId) { alert("Select Site and Light"); return; }
    const user = await getOfflineUser();
    const wid = workerId || await getWorkerId() || user?.workerId || "local";
    const wdb = getWorkerDB(wid);
    await refreshOfflineAuth();

    const selectedLightBefore = await wdb.lights.get(form.lightId) as OfflineLight | undefined;
    if (selectedLightBefore && selectedLightBefore.stockAvailable < newTotal && !editingId) {
      if (!confirm(`Only ${selectedLightBefore.stockAvailable} pcs available but you need ${newTotal}. Save anyway?`)) return;
    }

    if (editingId) {
      const existing = await wdb.replacements.get(editingId) as OfflineReplacement | undefined;
      if (!existing) return;
      if (existing.lightId !== form.lightId) {
        const oldLight = await wdb.lights.get(existing.lightId) as OfflineLight | undefined;
        if (oldLight) {
          const reverted = Math.max(0, (oldLight.stockInstalled||0) - (existing.newTotalLights||0));
          await wdb.lights.put({ ...oldLight, stockInstalled: reverted, stockAvailable: Math.max(0, oldLight.stockIn - (oldLight.stockDamage||0) - reverted) });
        }
      }
      const oldNew = existing.newTotalLights || 0;
      const updatedData: OfflineReplacement = {
        ...existing, date: form.date ? new Date(form.date) : new Date(), siteId: form.siteId, lightId: form.lightId,
        existingWattage: form.existingWattage, existingFixtureType: form.existingFixtureType,
        oldFixturesQty: Number(form.oldFixturesQty)||0, oldLightsPerFixture: Number(form.oldLightsPerFixture)||0, oldTotalLights: oldTotal, oldLampWattage: form.oldLampWattage,
        newFixturesQty: Number(form.newFixturesQty)||0, newLightsPerFixture: Number(form.newLightsPerFixture)||0, newTotalLights: newTotal,
        newWattageLabel: form.newWattageLabel, typeOfReplacement: form.typeOfReplacement, colorTemp: form.colorTemp,
        subContractor: form.subContractor, manpower: Number(form.manpower)||0, lightingControl: form.lightingControl,
        sensorQty: Number(form.sensorQty)||0, controlledLightsQty: Number(form.controlledLightsQty)||0, relayQty: Number(form.relayQty)||0,
        remarks: form.remarks, remarkDate: form.remarkDate,
        workerId: wid, site: user?.site || existing.site || "Dalkia-Site",
        synced: false,
      };
      await wdb.replacements.put(updatedData);
      const cur = await wdb.lights.get(form.lightId) as OfflineLight | undefined;
      if (cur) {
        const isSameLight = existing.lightId === form.lightId;
        const diff = isSameLight ? newTotal - oldNew : newTotal;
        const newInstalled = Math.max(0, (cur.stockInstalled||0)+diff);
        await wdb.lights.put({ ...cur, stockInstalled: newInstalled, stockAvailable: Math.max(0, cur.stockIn - (cur.stockDamage||0) - newInstalled) });
      }
      try {
        const apiId = existing._id || existing.localId;
        const res = await fetch(`/api/replacements/${apiId}`, { method: "PUT", headers: { "Content-Type":"application/json" }, body: JSON.stringify(updatedData), credentials: "include" });
        if (res.ok) { const saved = await res.json() as RemoteRep; await wdb.replacements.update(editingId, { synced: true, _id: saved._id }); }
      } catch {}
      resetForm(); await loadAll(); return;
    }

    const localId = generateLocalId();
    const data: OfflineReplacement = {
      localId, date: form.date ? new Date(form.date) : new Date(), siteId: form.siteId, lightId: form.lightId,
      existingWattage: form.existingWattage, existingFixtureType: form.existingFixtureType,
      oldFixturesQty: Number(form.oldFixturesQty)||0, oldLightsPerFixture: Number(form.oldLightsPerFixture)||0, oldTotalLights: oldTotal, oldLampWattage: form.oldLampWattage,
      newFixturesQty: Number(form.newFixturesQty)||0, newLightsPerFixture: Number(form.newLightsPerFixture)||0, newTotalLights: newTotal,
      newWattageLabel: form.newWattageLabel, typeOfReplacement: form.typeOfReplacement, colorTemp: form.colorTemp,
      subContractor: form.subContractor, manpower: Number(form.manpower)||0, lightingControl: form.lightingControl,
      sensorQty: Number(form.sensorQty)||0, controlledLightsQty: Number(form.controlledLightsQty)||0, relayQty: Number(form.relayQty)||0,
      remarks: form.remarks, remarkDate: form.remarkDate,
      userId: user?._id || wid, workerId: wid, site: user?.site || "Dalkia-Site", synced: false,
    };
    await wdb.replacements.put(data);
    const cur = await wdb.lights.get(form.lightId) as OfflineLight | undefined;
    if (cur) {
      const newInstalled = (cur.stockInstalled||0)+newTotal;
      await wdb.lights.put({ ...cur, stockInstalled: newInstalled, stockAvailable: Math.max(0, cur.stockIn - (cur.stockDamage||0) - newInstalled) });
    }
    try {
      const res = await fetch("/api/replacements", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(data), credentials: "include" });
      const json = await res.json() as { _id?: string }; if (res.ok) await wdb.replacements.update(localId, { synced: true, _id: json._id });
    } catch {}
    resetForm(); setSearch(""); setVisibleCount(8); await loadAll();
  };

  const startEdit = (r: OfflineReplacement) => {
    const rr = r as RemoteRep;
    const matchedSite = sites.find(s => s.localId === r.siteId || s._id === r.siteId || s.localId === rr.siteLocalId || s._id === rr.siteLocalId);
    const matchedLight = lights.find(l => l.localId === r.lightId || l._id === r.lightId || l.localId === rr.lightLocalId || l._id === rr.lightLocalId);
    setEditingId(r.localId);
    setForm({
      siteId: matchedSite ? matchedSite.localId : r.siteId,
      lightId: matchedLight ? matchedLight.localId : r.lightId,
      date: new Date(r.date).toISOString().slice(0,10),
      existingWattage: r.existingWattage, existingFixtureType: r.existingFixtureType,
      oldFixturesQty: String(r.oldFixturesQty), oldLightsPerFixture: String(r.oldLightsPerFixture), oldLampWattage: r.oldLampWattage,
      newFixturesQty: String(r.newFixturesQty), newLightsPerFixture: String(r.newLightsPerFixture), newWattageLabel: r.newWattageLabel,
      typeOfReplacement: r.typeOfReplacement, colorTemp: r.colorTemp, subContractor: r.subContractor, manpower: String(r.manpower),
      lightingControl: r.lightingControl, sensorQty: String(r.sensorQty), controlledLightsQty: String(r.controlledLightsQty), relayQty: String(r.relayQty),
      remarks: r.remarks, remarkDate: r.remarkDate,
    });
    setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRep = async (r: OfflineReplacement) => {
  if (!confirm(`Delete ${r.newWattageLabel} - ${r.newTotalLights} pcs?`)) return;
  const wid = workerId || await getWorkerId() || r.workerId || "local";
  const wdb = getWorkerDB(wid);
  const foundLight = lights.find(l=> l._id===r.lightId || l.localId===r.lightId);
  const curId = foundLight?.localId || r.lightId;
  const cur = curId ? await wdb.lights.get(curId) as OfflineLight | undefined : undefined;
  if (cur) {
    const newInstalled = Math.max(0,(cur.stockInstalled||0)-r.newTotalLights);
    await wdb.lights.put({ ...cur, stockInstalled: newInstalled, stockAvailable: Math.max(0, cur.stockIn - (cur.stockDamage||0) - newInstalled) });
  }
  await wdb.replacements.delete(r.localId);
  setAllReps(prev => prev.filter(x => x.localId !== r.localId));
  try { await fetch(`/api/replacements/${r._id || r.localId}`, { method: "DELETE", credentials: "include" }); } catch {}
  await loadAll();
};

  const exportXLSX = () => {
    if (filtered.length === 0) { alert("No data to export"); return; }
    const findSite = (id: string) => sites.find(s => s.localId === id || s._id === id);
    const findLight = (id: string) => lights.find(l => l.localId === id || l._id === id);
    const rows = filtered.map(r=>{
      const site = findSite(r.siteId);
      const light = findLight(r.lightId);
      return {
        "Date": new Date(r.date).toLocaleDateString(),
        "Site Name": site?.siteName || "", "Site No": site?.siteNo || "", "City": site?.city || "",
        "Project Name": site?.projectName || "", "Area/Zone": site?.areaZone || "", "Floor": site?.floor || "", "Room No": site?.roomNo || "",
        "Existing Wattage": r.existingWattage, "Existing Fixture Type": r.existingFixtureType,
        "Old Fixtures Qty": r.oldFixturesQty, "Old Lights Per Fixture": r.oldLightsPerFixture, "Old Total Lights": r.oldTotalLights, "Old Lamp Wattage": r.oldLampWattage,
        "New Fixtures Qty": r.newFixturesQty, "New Lights Per Fixture": r.newLightsPerFixture, "New Total Lights": r.newTotalLights, "New Wattage Label": r.newWattageLabel,
        "Light Model": light?.modelNo || "", "Light Name": light?.lightName || "", "Brand Full": light?.brandModelFull || "", "Company": light?.company || "",
        "Type Of Replacement": r.typeOfReplacement, "Color Temp": r.colorTemp, "Sub-Contractor": r.subContractor, "Manpower": r.manpower,
        "Lighting Control": r.lightingControl, "Sensor Qty": r.sensorQty, "Controlled Lights Qty": r.controlledLightsQty, "Relay Qty": r.relayQty,
        "Remarks": r.remarks, "Remark Date": r.remarkDate, "Worker": r.workerId, "Synced": r.synced ? "Yes" : "Offline"
      };
    });
    const totalLights = filtered.reduce((s,x)=>s+x.newTotalLights,0);
    const title = [
      [`DALKIA GROUPE eDF - Lighting Replacement Report - Worker ${workerId}`],
      [`Generated: ${new Date().toLocaleString()} | Records: ${filtered.length} | Total Installed: ${totalLights} pcs | Search: ${search || 'All'}`],
      []
    ];
    const ws = XLSX.utils.aoa_to_sheet(title);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 3 });
    const headerRowIndex = 3;
    const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: headerRowIndex, c: C });
      if (ws[cellAddr]) {
        ws[cellAddr].s = {
          font: { bold: true, sz: 11 }, fill: { patternType: "solid", fgColor: { rgb: "FFB6D7A8" } },
          alignment: { horizontal: "center", vertical: "center" },
          border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
        };
      }
    }
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: k.includes("Name") ? 22 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Replacements");
    XLSX.writeFile(wb, `Dalkia-Replacements-${workerId}-${new Date().toISOString().slice(0,10)}.xlsx`, { cellStyles: true } as never);
  };

  const selectedLight = lights.find(li => li.localId === form.lightId || li._id === form.lightId);
  const numInput = (v: string, k: keyof ReplacementForm) => <input type="text" inputMode="numeric" pattern="[0-9]*" value={v} onChange={e=>setForm({...form, [k]: e.target.value.replace(/[^0-9]/g,"")})} onFocus={e=>e.target.select()} className="border p-2.5 rounded text-[12px] bg-blue-50 h-9.5" />;

  return (
    <div className="px-2 sm:px-0 max-w-[100vw] overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
        <h1 className="text-[14px] sm:text-[16px] font-bold">🔧 Replacements - {filtered.length} | {workerId.slice(0,8)}</h1>
        <div className="flex gap-1.5 w-full sm:w-auto">
          <input value={search} onChange={e=>{setSearch(e.target.value); setVisibleCount(8);}} placeholder="Search site / ST8A / 4X8.9 / Ettiqa" className="border p-2 rounded-full text-[11px] flex-1 sm:w-40 h-8" />
          <button onClick={exportXLSX} className="bg-green-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold h-8">📊 XLSX</button>
          <button onClick={()=>{ if(editingId) resetForm(); else setShowForm(!showForm);}} className="bg-orange-600 text-white px-3 py-1 rounded-full text-[11px] font-bold h-8">{showForm ? "Close" : "+ New"}</button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-3 rounded-xl border mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="col-span-1 sm:col-span-2 text-[10px] font-bold text-blue-600">{editingId ? `✏️ Edit - ${sites.find(s=>s.localId===form.siteId)?.siteName || ''}` : "➕ New Report"}</div>
          <Field label="Date"><input type="date" value={form.date} onChange={e=>setForm({...form, date:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Site *"><select value={form.siteId} onChange={e=>setForm({...form, siteId:e.target.value})} className="border p-2.5 rounded text-[12px] bg-yellow-50 h-9.5"><option value="">Select Site</option>{sites.map(s=><option key={s.localId} value={s.localId}>{s.siteName} - {s.siteNo}</option>)}</select></Field>
          <Field label="Light Stock *"><select value={form.lightId} onChange={e=>setForm({...form, lightId:e.target.value})} className="border p-2.5 rounded text-[12px] bg-yellow-50 h-9.5"><option value="">Select Light</option>{lights.map(li=><option key={li.localId} value={li.localId}>{li.lightName} - {li.modelNo} - Avl {li.stockAvailable}</option>)}</select></Field>
          <Field label="Existing Wattage"><input value={form.existingWattage} onChange={e=>setForm({...form, existingWattage:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Existing Fixture"><input value={form.existingFixtureType} onChange={e=>setForm({...form, existingFixtureType:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Old Fixtures Qty">{numInput(form.oldFixturesQty, "oldFixturesQty")}</Field>
          <Field label="Old Lights/Fixture">{numInput(form.oldLightsPerFixture, "oldLightsPerFixture")}</Field>
          <Field label="Old Total"><div className="border p-2.5 rounded text-[12px] bg-gray-100 font-bold h-9.5 flex items-center">Old: {oldTotal}</div></Field>
          <Field label="Old Lamp Wattage"><input value={form.oldLampWattage} onChange={e=>setForm({...form, oldLampWattage:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="New Fixtures Qty">{numInput(form.newFixturesQty, "newFixturesQty")}</Field>
          <Field label="New Lights/Fixture">{numInput(form.newLightsPerFixture, "newLightsPerFixture")}</Field>
          <Field label="New Total"><div className="border p-2.5 rounded text-[12px] bg-green-100 font-bold text-green-700 h-9.5 flex items-center">New: {newTotal}</div></Field>
          <Field label="New Wattage Label"><input value={form.newWattageLabel} onChange={e=>setForm({...form, newWattageLabel:e.target.value})} className="border p-2.5 rounded text-[12px] font-bold h-9.5" /></Field>
          <Field label="Type"><input value={form.typeOfReplacement} onChange={e=>setForm({...form, typeOfReplacement:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Color Temp"><input value={form.colorTemp} onChange={e=>setForm({...form, colorTemp:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Sub-Contractor"><input value={form.subContractor} onChange={e=>setForm({...form, subContractor:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          <Field label="Manpower">{numInput(form.manpower, "manpower")}</Field>
          <Field label="Lighting Control"><select value={form.lightingControl} onChange={e=>setForm({...form, lightingControl:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5"><option value="No">No</option><option value="Yes">Yes</option></select></Field>
          <Field label="Sensor Qty">{numInput(form.sensorQty, "sensorQty")}</Field>
          <Field label="Controlled Qty">{numInput(form.controlledLightsQty, "controlledLightsQty")}</Field>
          <Field label="Relay Qty">{numInput(form.relayQty, "relayQty")}</Field>
          <Field label="Remarks"><input value={form.remarks} onChange={e=>setForm({...form, remarks:e.target.value})} className="border p-2.5 rounded text-[12px] h-9.5" /></Field>
          {selectedLight && <p className="col-span-1 sm:col-span-2 text-[10px] text-blue-700 font-bold bg-blue-50 p-2 rounded">Selected: {selectedLight.lightName} Avl {selectedLight.stockAvailable} → After {Math.max(0, selectedLight.stockAvailable - newTotal)}</p>}
          <button onClick={()=>void save()} className="col-span-1 sm:col-span-2 bg-orange-600 text-white p-3 rounded-lg font-bold text-[13px] h-10.5 mt-1">{editingId ? "Update Report → Adjust Stock" : "Save Replacement → Minus Stock"}</button>
          {editingId && <button onClick={resetForm} className="col-span-1 sm:col-span-2 bg-gray-100 p-2.5 rounded text-[11px] h-9.5">Cancel</button>}
        </div>
      )}

      <div className="bg-white rounded-xl border divide-y overflow-hidden">
        {visible.length===0 ? <p className="p-4 text-[11px] text-gray-400 text-center">No match — try Building 83 / Al Khaleej / ST8A / Ettiqa</p> : visible.map(r=>{
          const site = sites.find(s=>s.localId===r.siteId || s._id===r.siteId);
          const light = lights.find(l=>l.localId===r.lightId || l._id===r.lightId);
          return (
            <div key={r.localId} className="p-2.5 flex justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-[11px] truncate">{site?.siteName || r.siteId.slice(0,8)} • {r.newWattageLabel} • {r.newTotalLights} pcs</p>
                <p className="text-[9px] text-gray-500 truncate">{new Date(r.date).toLocaleDateString()} • {light?.modelNo || ""} • {r.subContractor} {!r.synced && <span className="text-amber-600">• offline</span>}</p>
              </div>
              <div className="flex gap-1 items-start shrink-0">
                <button onClick={()=>startEdit(r)} className="text-[9px] bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold">Edit</button>
                <button onClick={()=>void deleteRep(r)} className="text-[9px] bg-red-50 text-red-600 px-2 py-1 rounded font-bold">Del</button>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && <button onClick={()=>setVisibleCount(c=>c+LIMIT_STEP)} className="w-full mt-3 bg-white border p-3 rounded-xl font-bold text-[11px]">Load More ↓ {visible.length}/{filtered.length}</button>}
    </div>
  );
}

export default function ReplacementsPage() {
  return (
    <Suspense fallback={<div className="p-4 text-[11px] text-gray-400">Loading replacements...</div>}>
      <ReplacementsContent />
    </Suspense>
  );
}