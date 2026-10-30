import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Light from "@/models/Light";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LightBody {
  localId?: string;
  lightName?: string;
  wattage?: string;
  lightType?: string;
  modelNo?: string;
  brandModelFull?: string;
  company?: string;
  stockIn?: number;
  stockDamage?: number;
  stockInstalled?: number;
  workerId?: string;
  site?: string;
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const role = (session.user as { role?: string }).role || "worker";
  
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);
  const search = searchParams.get("search") || "";
  const company = searchParams.get("company") || "";
  const targetWorkerId = searchParams.get("workerId") || "";

  const filter: Record<string, unknown> = {};

  // Worker → only own, Owner → all or filter by workerId
  if (role === "owner") {
    if (targetWorkerId) filter.workerId = targetWorkerId;
    // else {} = all workers for owner aggregation page
  } else {
    filter.workerId = workerId;
  }

  if (company) filter.company = company;
  if (search) {
    filter.$or = [
      { modelNo: { $regex: search, $options: "i" } },
      { lightName: { $regex: search, $options: "i" } },
      { brandModelFull: { $regex: search, $options: "i" } },
    ];
  }

  const lights = await Light.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .maxTimeMS(4000);

  return NextResponse.json(lights);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const site = (session.user as { site?: string }).site || "Dalkia-Site";

  const body = (await req.json()) as LightBody;
  const stockIn = Number(body.stockIn) || 0;
  const stockDamage = Number(body.stockDamage) || 0;
  const stockInstalled = Number(body.stockInstalled) || 0;
  const stockAvailable = Math.max(0, stockIn - stockDamage - stockInstalled);

  if (body.localId) {
    const existing = await Light.findOne({ localId: body.localId, workerId });
    if (existing) {
      const updated = await Light.findOneAndUpdate(
        { localId: body.localId, workerId },
        { ...body, stockIn, stockDamage, stockInstalled, stockAvailable, userId, workerId, site, synced: true },
        { new: true }
      ).lean();
      return NextResponse.json(updated);
    }
  }

  const light = await Light.create({
    lightName: body.lightName,
    wattage: body.wattage,
    lightType: body.lightType,
    modelNo: body.modelNo,
    brandModelFull: body.brandModelFull,
    company: body.company,
    stockIn, stockDamage, stockInstalled, stockAvailable,
    userId,
    workerId,
    site,
    localId: body.localId,
    synced: true,
  });

  return NextResponse.json(light, { status: 201 });
}