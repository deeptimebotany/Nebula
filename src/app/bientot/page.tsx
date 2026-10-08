import Link from "next/link";
import { PublicShell } from "@/components/marketing/public-shell";
import { TrackView } from "@/components/marketing/track-view";
import { LaunchOrbit, LaunchProgress } from "@/components/marketing/launch-loader";
import { LaunchWaitlistForm } from "@/components/marketing/launch-waitlist-form";
import { ButtonLink } from "@/components/ui/button";
import { IconCheck, IconClock, IconRefresh } from "@/components/dashboard/icons";
import { EARLY_ACCESS_QUERY, LAUNCH_STEPS, launchProgress, type LaunchStepState } from "@/lib/launch";
import { pageMetadata } from "@/lib/seo";
import { SEO_PRELAUNCH } from "@/lib/seo-pages";
import { clsx } from "@/lib/clsx";

// Page « Bientôt » (pré-lancement, 30/09/2026, voir src/lib/launch.ts) :
// là où mènent /register et les boutons d'inscription tant que le site n'est
// pas ouvert. Page vitrine pré-générée (aucune donnée, aucune session) ;
// une fois le site ouvert, le middleware la redirige vers /register.
// Non indexée : elle n'existe que le temps du pré-lancement.
export const metadata = { ...pageMetadata(SEO_PRELAUNCH), robots: { index: false, follow: true } };

const STATE_LABEL: Record<LaunchStepState, string> = { done: "Prêt", doing: "En cours", todo: "Bientôt" };

function StepIcon({ state }: { state: LaunchStepState }) {
  if (state === "done") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <IconCheck className="h-4 w-4" />
      </span>
    );
  }
  if (state === "doing") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aurora-400/15 text-aurora-300">
        <IconRefresh className="h-4 w-4 motion-safe:animate-spin [animation-duration:2.4s]" />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-slate-400">
      <IconClock className="h-4 w-4" />
    </span>
  );
}

export default function BientotPage() {
  const progress = launchProgress();
  return (
    <PublicShell width="max-w-5xl">
      <TrackView name="landing_view" meta={{ landing: "bientot" }} />

      <section className="text-center">
        <LaunchOrbit />
        <p className="mt-8 inline-flex items-center gap-2 rounded-full border border-[color:var(--nb-sep-strong)] px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-aurora-300 motion-safe:animate-pulse" />
          Pré-lancement
        </p>
        <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">
          Nebula se prépare <span className="nb-accent-ink">au décollage</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-slate-400 sm:text-lg">
          L&apos;application est prête, mais nous faisons les derniers réglages avec les réseaux sociaux et nos premiers partenaires avant
          d&apos;ouvrir les inscriptions à tous. Laissez votre adresse : vous serez parmi les premiers prévenus.
        </p>
        <div className="mt-10">
          <LaunchProgress value={progress} />
        </div>
      </section>

      <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-[1.1fr_1fr]">
        <LaunchWaitlistForm />

        <div className="border-t border-[color:var(--nb-sep)] pt-6">
          <h2 className="font-display text-lg font-semibold text-white">Où en est-on ?</h2>
          <ol className="mt-4 space-y-3.5">
            {LAUNCH_STEPS.map((step) => (
              <li key={step.label} className="flex items-start gap-3">
                <StepIcon state={step.state} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-white">
                    {step.label}
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        step.state === "done" && "bg-emerald-500/10 text-emerald-300",
                        step.state === "doing" && "bg-aurora-400/10 text-aurora-300",
                        step.state === "todo" && "bg-white/[0.06] text-slate-400"
                      )}
                    >
                      {STATE_LABEL[step.state]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-14 border-t border-[color:var(--nb-sep)] pt-10 text-center">
        <h2 className="font-display text-xl font-semibold text-white">En attendant l&apos;ouverture</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Les outils gratuits sont déjà ouverts à tous, sans compte : idées de publications, hashtags, aperçu avant publication et
          bien d&apos;autres.
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <ButtonLink href="/outils" className="w-full sm:w-auto">
            Essayer les outils gratuits
          </ButtonLink>
          <ButtonLink href="/#visite" variant="outline" className="w-full sm:w-auto">
            Voir l&apos;application
          </ButtonLink>
        </div>
      </section>

      <p className="mt-10 text-center text-xs text-slate-500">
        Équipe ou partenaire ?{" "}
        <Link href="/login" className="text-slate-300 underline-offset-2 hover:text-white hover:underline">
          Se connecter
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href={`/register?${EARLY_ACCESS_QUERY.name}=${EARLY_ACCESS_QUERY.value}`} className="text-slate-300 underline-offset-2 hover:text-white hover:underline">
          Créer un compte invité
        </Link>
      </p>
    </PublicShell>
  );
}
