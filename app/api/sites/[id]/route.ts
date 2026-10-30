import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Site from "@/models/Site";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function findSite(id: string, workerId: string, role: string) {
  if (!id) return null;
  const isOwner = role === "owner";
  const base = isOwner ? {} : { workerId };
  if (Types.ObjectId.isValid(id)) {
    const byId = await Site.findOne({ _id: id, ...base });
    if (byId) return byId;
  }
  const byLocal = await Site.findOne({ localId: id, ...base });
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
  const site = await findSite(id, workerId, role);
  if (!site) return NextResponse.json({ error: `Site not found ${id}` }, { status: 404 });
  return NextResponse.json(site);
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
  const siteName = (session.user as { site?: string }).site || "Dalkia-Site";

  const { id } = await params;
  const site = await findSite(id, workerId, role);
  if (!site) return NextResponse.json({ error: `Site not found ${id}` }, { status: 404 });

  const body = await req.json() as Record<string, string | undefined>;

  const updated = await Site.findByIdAndUpdate(
    site._id,
    {
      projectType: body.projectType ?? site.projectType,
      projectName: body.projectName ?? site.projectName,
      siteNo: body.siteNo ?? site.siteNo,
      siteName: body.siteName ?? site.siteName,
      floor: body.floor ?? site.floor,
      roomNo: body.roomNo ?? site.roomNo,
      roomType: body.roomType ?? site.roomType,
      areaZone: body.areaZone ?? site.areaZone,
      locationName: body.locationName ?? site.locationName,
      city: body.city ?? site.city,
      streetName: body.streetName ?? site.streetName,
      poleNo: body.poleNo ?? site.poleNo,
      userId: role === "owner" ? site.userId : userId,
      workerId: site.workerId,
      site: role === "owner" ? site.site : siteName,
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
  const site = await findSite(id, workerId, role);
  if (!site) return NextResponse.json({ error: `Site not found ${id}` }, { status: 404 });

  await Site.findByIdAndDelete(site._id);
  return NextResponse.json({ success: true, deletedId: id });
}