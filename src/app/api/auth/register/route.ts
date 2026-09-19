import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode, REFERRAL_TRIAL_DAYS } from "@/lib/referral";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  brandName: z.string().min(2),
  referralCode: z.string().trim().toUpperCase().optional()
});

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `marque-${Date.now()}`
  );
}

export async function POST(req: Request) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const { name, email, password, brandName, referralCode } = body.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Un compte existe déjà avec cet email." }, { status: 409 });
  }

  // Code de parrainage optionnel : s'il correspond à un compte existant, ce
  // NOUVEAU compte reçoit l'accès IA gratuitement pendant REFERRAL_TRIAL_DAYS
  // jours, même sur le palier Gratuit (voir src/lib/billing/plan.ts).
  let referrer: { id: string } | null = null;
  if (referralCode) {
    referrer = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!referrer) {
      return NextResponse.json({ error: "Code de parrainage invalide." }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let slug = slugify(brandName);
  const slugTaken = await prisma.brand.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${Math.floor(Math.random() * 10000)}`;

  const ownReferralCode = await generateUniqueReferralCode();
  const aiTrialUntil = referrer ? new Date(Date.now() + REFERRAL_TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;

  await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash,
      referralCode: ownReferralCode,
      referredByCode: referrer ? referralCode : null,
      aiTrialUntil,
      memberships: {
        create: {
          role: "OWNER",
          brand: { create: { name: brandName, slug } }
        }
      }
    }
  });

  return NextResponse.json({ ok: true, aiTrialDays: referrer ? REFERRAL_TRIAL_DAYS : 0 });
}
