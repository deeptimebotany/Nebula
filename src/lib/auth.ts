import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  // maxAge explicite (60 jours) : la session est mémorisée dans un cookie
  // persistant, donc rouvrir le site plus tard ne redemande pas de
  // connexion (voir la redirection automatique vers /dashboard sur "/",
  // "/login" et "/register" quand une session valide existe déjà).
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Identifiants",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() }
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.uid as string;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET
};
