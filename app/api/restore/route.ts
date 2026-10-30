import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Site from "@/models/Site";
import Light from "@/models/Light";
import Replacement from "@/models/Replacement";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SessionUser = {
  id: string;
  workerId?: string;
  role?: string;
  site?: string;
};

export async function POST(req: NextRequest) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sUser = session.user as unknown as SessionUser;
  const workerId = sUser.workerId || sUser.id;
  const userId = sUser.id;

  const body = await req.json() as { data?: { sites?: Record<string, unknown>[]; lights?: Record<string, unknown>[]; replacements?: Record<string, unknown>[] }; sites?: Record<string, unknown>[]; lights?: Record<string, unknown>[]; replacements?: Record<string, unknown>[] };
  const data = (body.data || body) as { sites?: Record<string, unknown>[]; lights?: Record<string, unknown>[]; replacements?: Record<string, unknown>[] };

  const counts = { sites: 0, lights: 0, replacements: 0 };

  try {
    if (data.sites?.length) {
      for (const s of data.sites) {
        const localId = s.localId as string;
        await Site.findOneAndUpdate(
          { localId, workerId },
          { ...s, workerId, userId, synced: true },
          { upsert: true, new: true }
        );
        counts.sites++;
      }
    }
    if (data.lights?.length) {
      for (const l of data.lights) {
        const localId = l.localId as string;
        await Light.findOneAndUpdate(
          { localId, workerId },
          { ...l, workerId, userId, synced: true },
          { upsert: true, new: true }
        );
        counts.lights++;
      }
    }
    if (data.replacements?.length) {
      for (const r of data.replacements) {
        const localId = r.localId as string;
        const rawDate = r.date as string | undefined;
        await Replacement.findOneAndUpdate(
          { localId, workerId },
          { ...r, workerId, userId, synced: true, date: rawDate ? new Date(rawDate) : new Date() },
          { upsert: true, new: true }
        );
        counts.replacements++;
      }
    }

    return NextResponse.json({ success: true, ...counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}