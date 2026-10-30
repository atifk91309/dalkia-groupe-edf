import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Site from "@/models/Site";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SiteBody {
  localId?: string;
  projectType?: string;
  projectName?: string;
  siteNo?: string;
  siteName?: string;
  floor?: string;
  roomNo?: string;
  roomType?: string;
  areaZone?: string;
  locationName?: string;
  city?: string;
  streetName?: string;
  poleNo?: string;
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workerId = (session.user as { workerId?: string }).workerId || session.user.id;
  const role = (session.user as { role?: string }).role || "worker";

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);
  const search = searchParams.get("search") || "";
  const projectType = searchParams.get("projectType") || "";
  const city = searchParams.get("city") || "";
  const targetWorkerId = searchParams.get("workerId") || "";

  const filter: Record<string, unknown> = {};
  if (role === "owner") {
    if (targetWorkerId) filter.workerId = targetWorkerId;
  } else {
    filter.workerId = workerId;
  }

  if (projectType) filter.projectType = projectType;
  if (city) filter.city = city;
  if (search) {
    filter.$or = [
      { siteName: { $regex: search, $options: "i" } },
      { siteNo: { $regex: search, $options: "i" } },
      { projectName: { $regex: search, $options: "i" } },
      { locationName: { $regex: search, $options: "i" } },
    ];
  }

  const sites = await Site.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .maxTimeMS(4000);

  return NextResponse.json(sites);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const siteName = (session.user as { site?: string }).site || "Dalkia-Site";

  const body = (await req.json()) as SiteBody;

  if (body.localId) {
    const existing = await Site.findOne({ localId: body.localId, workerId });
    if (existing) {
      const updated = await Site.findOneAndUpdate(
        { localId: body.localId, workerId },
        { ...body, userId, workerId, site: siteName, synced: true },
        { new: true }
      ).lean();
      return NextResponse.json(updated);
    }
  }

  const site = await Site.create({
    projectType: body.projectType || "BUILDING",
    projectName: body.projectName,
    siteNo: body.siteNo,
    siteName: body.siteName,
    floor: body.floor || "N/A",
    roomNo: body.roomNo || "N/A",
    roomType: body.roomType,
    areaZone: body.areaZone,
    locationName: body.locationName,
    city: body.city,
    streetName: body.streetName,
    poleNo: body.poleNo,
    userId,
    workerId,
    site: siteName,
    localId: body.localId,
    synced: true,
  });

  return NextResponse.json(site, { status: 201 });
}