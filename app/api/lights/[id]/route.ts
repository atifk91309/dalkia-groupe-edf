import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Light from "@/models/Light";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function findLight(id: string, workerId: string, role: string) {
  if (!id) return null;
  const isOwner = role === "owner";
  
  if (Types.ObjectId.isValid(id)) {
    const filter = isOwner ? { _id: id } : { _id: id, workerId };
    const byId = await Light.findOne(filter);
    if (byId) return byId;
  }
  const filterLocal = isOwner ? { localId: id } : { localId: id, workerId };
  const byLocal = await Light.findOne(filterLocal);
  return byLocal || null;
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
  const light = await findLight(id, workerId, role);
  if (!light) return NextResponse.json({ error: `Light not found for id ${id}` }, { status: 404 });
  return NextResponse.json(light);
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
  const light = await findLight(id, workerId, role);
  if (!light) return NextResponse.json({ error: `Light not found for id ${id}` }, { status: 404 });

  const body = await req.json() as {
    lightName?: string; wattage?: string; lightType?: string;
    modelNo?: string; brandModelFull?: string; company?: string;
    stockIn?: number; stockDamage?: number; stockInstalled?: number;
  };

  const stockIn = body.stockIn !== undefined ? Number(body.stockIn) : light.stockIn;
  const stockDamage = body.stockDamage !== undefined ? Number(body.stockDamage) : light.stockDamage;
  const stockInstalled = body.stockInstalled !== undefined ? Number(body.stockInstalled) : light.stockInstalled;
  const stockAvailable = Math.max(0, stockIn - stockDamage - stockInstalled);

  const updated = await Light.findByIdAndUpdate(
    light._id,
    {
      lightName: body.lightName ?? light.lightName,
      wattage: body.wattage ?? light.wattage,
      lightType: body.lightType ?? light.lightType,
      modelNo: body.modelNo ?? light.modelNo,
      brandModelFull: body.brandModelFull ?? light.brandModelFull,
      company: body.company ?? light.company,
      stockIn, stockDamage, stockInstalled, stockAvailable,
      userId: role === "owner" ? light.userId : userId,
      workerId: light.workerId, // never change owner of light
      site: role === "owner" ? light.site : site,
      synced: true,
    },
    { new: true }
  ).lean();

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
  const light = await findLight(id, workerId, role);
  if (!light) return NextResponse.json({ error: `Light not found for id ${id}` }, { status: 404 });

  await Light.findByIdAndDelete(light._id);
  return NextResponse.json({ success: true, deletedId: id });
}