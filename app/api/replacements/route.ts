import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Replacement from "@/models/Replacement";
import Site from "@/models/Site";
import Light from "@/models/Light";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ReplacementBody = {
  localId?: string;
  siteId: string;
  lightId: string;
  date?: string;
  existingWattage?: string;
  existingFixtureType?: string;
  oldFixturesQty?: number;
  oldLightsPerFixture?: number;
  oldLampWattage?: string;
  newFixturesQty?: number;
  newLightsPerFixture?: number;
  newWattageLabel?: string;
  typeOfReplacement?: string;
  colorTemp?: string;
  subContractor?: string;
  manpower?: number;
  lightingControl?: string;
  sensorQty?: number;
  controlledLightsQty?: number;
  relayQty?: number;
  remarks?: string;
  remarkDate?: string;
};

async function resolveSiteId(inputId: string, workerId: string, role: string) {
  if (!inputId) return null;
  const isOwner = role === "owner";
  if (Types.ObjectId.isValid(inputId)) {
    const byId = await Site.findOne(isOwner ? { _id: inputId } : { _id: inputId, workerId });
    if (byId) return { mongoId: byId._id.toString(), localId: byId.localId };
  }
  const byLocal = await Site.findOne(isOwner ? { localId: inputId } : { localId: inputId, workerId });
  if (byLocal) return { mongoId: byLocal._id.toString(), localId: byLocal.localId };
  return null;
}

async function resolveLightId(inputId: string, workerId: string, role: string) {
  if (!inputId) return null;
  const isOwner = role === "owner";
  if (Types.ObjectId.isValid(inputId)) {
    const byId = await Light.findOne(isOwner ? { _id: inputId } : { _id: inputId, workerId });
    if (byId) return { mongoId: byId._id.toString(), localId: byId.localId };
  }
  const byLocal = await Light.findOne(isOwner ? { localId: inputId } : { localId: inputId, workerId });
  if (byLocal) return { mongoId: byLocal._id.toString(), localId: byLocal.localId };
  return null;
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workerId = (session.user as { workerId?: string }).workerId || session.user.id;
  const role = (session.user as { role?: string }).role || "worker";

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") || "1");
  const limit = Math.min(Number(searchParams.get("limit") || "200"), 500);
  const siteIdFilter = searchParams.get("siteId") || "";
  const targetWorkerId = searchParams.get("workerId") || "";
  const search = searchParams.get("search") || "";

  const filter: Record<string, unknown> = {};
  if (role === "owner") {
    if (targetWorkerId) filter.workerId = targetWorkerId;
  } else {
    filter.workerId = workerId;
  }

  if (siteIdFilter) {
    const resolved = await resolveSiteId(siteIdFilter, workerId, role);
    filter.siteId = resolved ? resolved.mongoId : siteIdFilter;
  }
  if (search) filter.remarks = { $regex: search, $options: "i" };

  const skip = (page - 1) * limit;
  const replacements = await Replacement.find(filter)
    .sort({ date: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .maxTimeMS(5000);

  return NextResponse.json(replacements);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const role = (session.user as { role?: string }).role || "worker";
  const site = (session.user as { site?: string }).site || "Dalkia-Site";

  const body = (await req.json()) as ReplacementBody;

  const oldFixturesQty = Number(body.oldFixturesQty) || 0;
  const oldLightsPerFixture = Number(body.oldLightsPerFixture) || 0;
  const newFixturesQty = Number(body.newFixturesQty) || 0;
  const newLightsPerFixture = Number(body.newLightsPerFixture) || 0;

  const oldTotalLights = Math.max(0, oldFixturesQty * oldLightsPerFixture);
  const newTotalLights = Math.max(0, newFixturesQty * newLightsPerFixture);

  if (body.localId) {
    const existing = await Replacement.findOne({ localId: body.localId, workerId });
    if (existing) {
      const updated = await Replacement.findOneAndUpdate(
        { localId: body.localId, workerId },
        { ...body, oldTotalLights, newTotalLights, userId, workerId, site, synced: true },
        { new: true }
      ).lean();
      return NextResponse.json(updated);
    }
  }

  const resolvedSite = await resolveSiteId(body.siteId, workerId, role);
  const resolvedLight = await resolveLightId(body.lightId, workerId, role);

  if (!resolvedSite) return NextResponse.json({ error: `Site not found for id ${body.siteId}` }, { status: 400 });
  if (!resolvedLight) return NextResponse.json({ error: `Light not found for id ${body.lightId}` }, { status: 400 });

  const replacement = await Replacement.create({
    date: body.date ? new Date(body.date) : new Date(),
    siteId: resolvedSite.mongoId,
    lightId: resolvedLight.mongoId,
    siteLocalId: resolvedSite.localId || (body.siteId.startsWith("local_") ? body.siteId : undefined),
    lightLocalId: resolvedLight.localId || (body.lightId.startsWith("local_") ? body.lightId : undefined),
    existingWattage: body.existingWattage,
    existingFixtureType: body.existingFixtureType,
    oldFixturesQty,
    oldLightsPerFixture,
    oldTotalLights,
    oldLampWattage: body.oldLampWattage,
    newFixturesQty,
    newLightsPerFixture,
    newTotalLights,
    newWattageLabel: body.newWattageLabel,
    typeOfReplacement: body.typeOfReplacement,
    colorTemp: body.colorTemp,
    subContractor: body.subContractor,
    manpower: body.manpower,
    lightingControl: body.lightingControl,
    sensorQty: body.sensorQty,
    controlledLightsQty: body.controlledLightsQty,
    relayQty: body.relayQty,
    remarks: body.remarks,
    remarkDate: body.remarkDate,
    userId,
    workerId,
    site,
    localId: body.localId,
    synced: true,
  });

  if (newTotalLights > 0) {
    try {
      const pipeline = [
        {
          $set: {
            stockInstalled: { $max: [0, { $add: ["$stockInstalled", newTotalLights] }] },
            stockAvailable: {
              $max: [0, { $subtract: [{ $subtract: ["$stockIn", "$stockDamage"] }, { $max: [0, { $add: ["$stockInstalled", newTotalLights] }] }] }],
            },
            synced: true,
          },
        },
      ];

      await Light.collection.findOneAndUpdate(
        { _id: new Types.ObjectId(resolvedLight.mongoId) },
        pipeline
      );
    } catch (err) {
      console.log("Stock update skipped on create:", err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json(replacement, { status: 201 });
}