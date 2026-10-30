import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Replacement from "@/models/Replacement";
import Light from "@/models/Light";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function findReplacement(id: string, workerId: string, role: string) {
  if (!id) return null;
  const isOwner = role === "owner";
  const base = isOwner ? {} : { workerId };
  if (Types.ObjectId.isValid(id)) {
    const byId = await Replacement.findOne({ _id: id, ...base });
    if (byId) return byId;
  }
  const byLocal = await Replacement.findOne({ localId: id, ...base });
  return byLocal || null;
}

async function adjustLightStockAtomic(lightId: string, diff: number) {
  if (!lightId || diff === 0) return;
  await Light.findOneAndUpdate(
    { _id: lightId },
    [
      {
        $set: {
          stockInstalled: { $max: [0, { $add: ["$stockInstalled", diff] }] },
          stockAvailable: {
            $max: [0, { $subtract: [{ $subtract: ["$stockIn", "$stockDamage"] }, { $max: [0, { $add: ["$stockInstalled", diff] }] }] }],
          },
          synced: true,
        },
      },
    ]
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workerId = (session.user as { workerId?: string }).workerId || session.user.id;
  const role = (session.user as { role?: string }).role || "worker";
  const { id } = await params;
  const rep = await findReplacement(id, workerId, role);
  if (!rep) return NextResponse.json({ error: `Replacement not found ${id}` }, { status: 404 });
  return NextResponse.json(rep);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const workerId = (session.user as { workerId?: string }).workerId || userId;
  const role = (session.user as { role?: string }).role || "worker";
  const site = (session.user as { site?: string }).site || "Dalkia-Site";

  const { id } = await params;
  const rep = await findReplacement(id, workerId, role);
  if (!rep) return NextResponse.json({ error: `Replacement not found ${id}` }, { status: 404 });

  const body = (await req.json()) as Record<string, unknown>;
  const oldNewTotal = rep.newTotalLights || 0;

  const oldFixturesQty = body.oldFixturesQty !== undefined ? Number(body.oldFixturesQty) : rep.oldFixturesQty;
  const oldLightsPerFixture = body.oldLightsPerFixture !== undefined ? Number(body.oldLightsPerFixture) : rep.oldLightsPerFixture;
  const newFixturesQty = body.newFixturesQty !== undefined ? Number(body.newFixturesQty) : rep.newFixturesQty;
  const newLightsPerFixture = body.newLightsPerFixture !== undefined ? Number(body.newLightsPerFixture) : rep.newLightsPerFixture;

  const oldTotalLights = Math.max(0, oldFixturesQty * oldLightsPerFixture);
  const newTotalLights = Math.max(0, newFixturesQty * newLightsPerFixture);

  const updated = await Replacement.findByIdAndUpdate(
    rep._id,
    {
      date: (body.date as string) ? new Date(body.date as string) : rep.date,
      existingWattage: (body.existingWattage as string) ?? rep.existingWattage,
      existingFixtureType: (body.existingFixtureType as string) ?? rep.existingFixtureType,
      oldFixturesQty, oldLightsPerFixture, oldTotalLights,
      oldLampWattage: (body.oldLampWattage as string) ?? rep.oldLampWattage,
      newFixturesQty, newLightsPerFixture, newTotalLights,
      newWattageLabel: (body.newWattageLabel as string) ?? rep.newWattageLabel,
      typeOfReplacement: (body.typeOfReplacement as string) ?? rep.typeOfReplacement,
      colorTemp: (body.colorTemp as string) ?? rep.colorTemp,
      subContractor: (body.subContractor as string) ?? rep.subContractor,
      manpower: body.manpower !== undefined ? Number(body.manpower) : rep.manpower,
      lightingControl: (body.lightingControl as string) ?? rep.lightingControl,
      sensorQty: body.sensorQty !== undefined ? Number(body.sensorQty) : rep.sensorQty,
      controlledLightsQty: body.controlledLightsQty !== undefined ? Number(body.controlledLightsQty) : rep.controlledLightsQty,
      relayQty: body.relayQty !== undefined ? Number(body.relayQty) : rep.relayQty,
      remarks: (body.remarks as string) ?? rep.remarks,
      remarkDate: (body.remarkDate as string) ?? rep.remarkDate,
      userId: role === "owner" ? rep.userId : userId,
      workerId: rep.workerId,
      site: role === "owner" ? rep.site : site,
      synced: true,
    },
    { new: true }
  ).lean();

  const diff = newTotalLights - oldNewTotal;
  if (diff !== 0 && rep.lightId) {
    await adjustLightStockAtomic(rep.lightId.toString(), diff);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workerId = (session.user as { workerId?: string }).workerId || session.user.id;
  const role = (session.user as { role?: string }).role || "worker";

  const { id } = await params;
  const rep = await findReplacement(id, workerId, role);
  if (!rep) return NextResponse.json({ error: `Replacement not found ${id}` }, { status: 404 });

  if (rep.lightId && rep.newTotalLights) {
    await adjustLightStockAtomic(rep.lightId.toString(), -rep.newTotalLights);
  }

  await Replacement.findByIdAndDelete(rep._id);
  return NextResponse.json({ success: true, deletedId: id, rolledBack: rep.newTotalLights || 0 });
}