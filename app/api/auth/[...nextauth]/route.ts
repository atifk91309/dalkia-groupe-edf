import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LeanUser = {
  _id: { toString: () => string };
  email: string;
  name: string;
  role: string;
  password: string;
  workerId?: string;
  site?: string;
  isActive?: boolean;
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        await dbConnect();
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const user = (await User.findOne({ email: normalizedEmail }).lean()) as LeanUser | null;
        if (!user) return null;
        if (user.isActive === false) return null;
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;
        void User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).exec();
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role || "worker",
          workerId: user.workerId || user._id.toString(),
          site: user.site || "Dalkia-Site",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.workerId = user.workerId;
        token.site = user.site;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.workerId = token.workerId as string;
        session.user.site = token.site as string;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: 365 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/login" },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };