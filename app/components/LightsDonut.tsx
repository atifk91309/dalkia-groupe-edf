"use client";
import { useMemo } from "react";

type Props = {
  totalIn: number;
  installed: number;
  damaged: number;
  available: number;
  isOwner: boolean;
};

type Slice = {
  label: string;
  value: number;
  pct: number;
  color: string;
};

function Donut({ data }: { data: Slice[] }) {
  const R = 40;
  const C = 2 * Math.PI * R;
  const sorted = [...data].sort((a, b) => b.pct - a.pct);
  return (
    <div className="flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        {sorted.map((s, i) => {
          const dash = (s.pct / 100) * C;
          const offset = sorted.slice(0, i).reduce((sum, prev) => sum + (prev.pct / 100) * C, 0);
          const visibleDash = s.value > 0 && s.pct > 0 && s.pct < 1.5 ? C * 0.025 : dash;
          return (
            <circle
              key={`${s.label}-${i}`}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth="12"
              strokeDasharray={`${visibleDash} ${C - visibleDash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="space-y-1 text-[12px]">
        {data.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            <span className="font-semibold">{s.label}:</span>
            <span>{s.value} ({s.pct.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LightsDonut({ totalIn, installed, damaged, available, isOwner }: Props) {
  const stats = useMemo(() => {
    const total = totalIn || 1;
    return {
      installedPct: (installed / total) * 100,
      damagedPct: (damaged / total) * 100,
      availablePct: (available / total) * 100,
    };
  }, [totalIn, installed, damaged, available]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <h3 className="font-bold text-[13px] mb-3">💡 Lights Status — {isOwner ? "Owner (All Workers)" : "My Work"}</h3>
        <Donut
          data={[
            { label: "Installed", value: installed, pct: stats.installedPct, color: "#0f766e" },
            { label: "Damaged", value: damaged, pct: stats.damagedPct, color: "#ef4444" },
            { label: "Available", value: available, pct: stats.availablePct, color: "#cbd5e1" },
          ]}
        />
        <div className="mt-3 grid grid-cols-3 text-center text-[11px] border-t pt-3">
          <div><div className="text-[18px] font-bold">{totalIn}</div>Total In</div>
          <div><div className="text-[18px] font-bold text-emerald-700">{stats.installedPct.toFixed(1)}%</div>Installed</div>
          <div><div className="text-[18px] font-bold text-red-500">{stats.damagedPct.toFixed(1)}%</div>Damaged</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <h3 className="font-bold text-[13px] mb-3">📦 Stock Health — {available} pcs left</h3>
        <Donut
          data={[
            { label: "Good Stock", value: available, pct: stats.availablePct, color: "#0d7a64" },
            { label: "Good Installed", value: installed, pct: stats.installedPct, color: "#14b8a6" },
            { label: "Damaged", value: damaged, pct: stats.damagedPct, color: "#f59e0b" },
          ]}
        />
      </div>
    </div>
  );
}