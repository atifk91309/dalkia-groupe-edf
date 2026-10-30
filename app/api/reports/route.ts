import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Site from "@/models/Site";
import Light from "@/models/Light";
import Replacement from "@/models/Replacement";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CountResult = { count: number };
type TotalLightsResult = { totalOld?: number; totalNew?: number };
type StockResult = { totalIn?: number; totalDamage?: number; totalInstalled?: number; totalAvailable?: number };
type SiteAgg = { _id: string; count: number };
type ContractorAgg = { _id: string; totalFixtures: number; totalLights: number; jobs: number };
type SiteReplaceAgg = { _id: string; totalLights: number; jobs: number };

export async function GET(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const role = (session.user as { role?: string }).role || "worker";

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ? new Date(searchParams.get("from") as string) : new Date(new Date().getFullYear(), 0, 1);
  const to = searchParams.get("to") ? new Date(searchParams.get("to") as string) : new Date();
  const city = searchParams.get("city") || "";
  const projectType = searchParams.get("projectType") || "";
  const targetWorkerId = searchParams.get("workerId") || "";

  let filterWorkerId: string | undefined;
  if (role === "owner" && targetWorkerId) filterWorkerId = targetWorkerId;
  else if (role !== "owner") filterWorkerId = workerId;

  const siteFilter: Record<string, unknown> = {};
  const lightFilter: Record<string, unknown> = {};
  const repFilter: Record<string, unknown> = { date: { $gte: from, $lte: to } };

  if (filterWorkerId) {
    siteFilter.workerId = filterWorkerId;
    lightFilter.workerId = filterWorkerId;
    repFilter.workerId = filterWorkerId;
  }

  if (city) siteFilter.city = city;
  if (projectType) siteFilter.projectType = projectType;

  const isOwnerAll = role === "owner" && !filterWorkerId;

  const [siteCount, lightCount, replacementCount, totalLightsStats, sitesByType, replacementsByContractor, replacementsBySite, stockSummary, recentReplacements] = await Promise.all([
    isOwnerAll
      ? Site.aggregate([
          { $match: siteFilter },
          { $group: { _id: { siteName: "$siteName", siteNo: "$siteNo" } } },
          { $count: "count" }
        ]).then((r: CountResult[]) => r[0]?.count ?? 0)
      : Site.countDocuments(siteFilter).maxTimeMS(4000),

    isOwnerAll
      ? Light.aggregate([
          { $match: lightFilter },
          { $group: { _id: "$modelNo" } },
          { $count: "count" }
        ]).then((r: CountResult[]) => r[0]?.count ?? 0)
      : Light.countDocuments(lightFilter).maxTimeMS(4000),

    Replacement.countDocuments(repFilter).maxTimeMS(4000),

    Replacement.aggregate([
      { $match: repFilter },
      { $group: { _id: null, totalOld: { $sum: "$oldTotalLights" }, totalNew: { $sum: "$newTotalLights" }, totalJobs: { $sum: 1 } } }
    ]).option({ maxTimeMS: 5000 }) as Promise<TotalLightsResult[]>,

    Site.aggregate([
      { $match: siteFilter },
      { $group: { _id: "$projectType", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).option({ maxTimeMS: 5000 }) as Promise<SiteAgg[]>,

    Replacement.aggregate([
      { $match: repFilter },
      { $group: { _id: "$subContractor", totalFixtures: { $sum: "$newFixturesQty" }, totalLights: { $sum: "$newTotalLights" }, jobs: { $sum: 1 } } },
      { $sort: { totalLights: -1 } },
      { $limit: 10 }
    ]).option({ maxTimeMS: 5000 }) as Promise<ContractorAgg[]>,

    Replacement.aggregate([
      { $match: repFilter },
      { $group: { _id: "$siteId", totalLights: { $sum: "$newTotalLights" }, jobs: { $sum: 1 } } },
      { $sort: { jobs: -1 } },
      { $limit: 10 }
    ]).option({ maxTimeMS: 5000 }) as Promise<SiteReplaceAgg[]>,

    // ✅ FIXED: Sum ALL lights = 322 damage, not dedup by modelNo
    Light.aggregate([
      { $match: lightFilter },
      { $group: { _id: null, totalIn: { $sum: "$stockIn" }, totalDamage: { $sum: "$stockDamage" }, totalInstalled: { $sum: "$stockInstalled" }, totalAvailable: { $sum: "$stockAvailable" } } }
    ]).option({ maxTimeMS: 5000 }) as Promise<StockResult[]>,

    Replacement.find(repFilter).sort({ date: -1 }).limit(20).lean().maxTimeMS(4000)
  ]);

  const validTopIds = replacementsBySite
    .map((r) => r._id)
    .filter((id): id is string => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id));

  let siteMap = new Map<string, string>();
  if (validTopIds.length) {
    const topSites = await Site.find({ _id: { $in: validTopIds } }).select("siteName siteNo").lean().maxTimeMS(3000);
    siteMap = new Map(topSites.map((s) => [s._id.toString(), `${s.siteName || "Site"} (${s.siteNo || ""})`]));
  }

  return NextResponse.json({
    range: { from, to },
    workerId: filterWorkerId || "all",
    kpi: {
      sites: siteCount,
      lights: lightCount,
      replacements: replacementCount,
      totalOldLights: totalLightsStats[0]?.totalOld ?? 0,
      totalNewLights: totalLightsStats[0]?.totalNew ?? 0,
      stockIn: stockSummary[0]?.totalIn ?? 0,
      stockDamage: stockSummary[0]?.totalDamage ?? 0,
      stockInstalled: stockSummary[0]?.totalInstalled ?? 0,
      stockAvailable: stockSummary[0]?.totalAvailable ?? 0,
    },
    breakdown: {
      sitesByType,
      byContractor: replacementsByContractor,
      bySite: replacementsBySite.map((r) => ({
        siteId: r._id,
        siteName: typeof r._id === "string" ? siteMap.get(r._id) || r._id.slice(0, 12) : "Unknown",
        totalLights: r.totalLights,
        jobs: r.jobs
      })),
    },
    recent: recentReplacements
  });
}