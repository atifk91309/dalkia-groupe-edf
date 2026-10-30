import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  name: string;
  email: string;
  password: string;
  role?: "owner" | "worker";
  site?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { name, email, password, site } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ message: "Password must be 6+ characters" }, { status: 400 });
    }

    await dbConnect();

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return NextResponse.json({ message: "User already exists" }, { status: 400 });
    }

    const totalUsers = await User.countDocuments();
    const isFirstUser = totalUsers === 0;
    const role = isFirstUser ? "owner" : "worker";

    // FINAL FIX: owner = NO workerId, worker = has workerId
    const workerId = role === "owner" 
      ? undefined 
      : `worker_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      ...(workerId ? { workerId } : {}),
      site: site || "Dalkia-Site",
    });

    return NextResponse.json(
      {
        message: isFirstUser
          ? "dalkia GROUPE eDF - Owner created - sees all 1000 workers"
          : "dalkia GROUPE eDF - Worker created - isolated",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          ...(user.workerId ? { workerId: user.workerId } : {}),
          site: user.site,
          isFirstOwner: isFirstUser,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("dalkia GROUPE eDF register error:", err);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}