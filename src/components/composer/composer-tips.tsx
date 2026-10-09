// Conseils et fonctionnement de la page Publier, repliés par défaut (Lot 4)
// — avant : deux cartes toujours ouvertes dans la colonne de droite.
// Refonte V2 (07/10/2026) : une simple ligne repliable, sans cadre.
export function ComposerTips() {
  return (
    <div className="border-t border-[color:var(--nb-sep)]">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[14px] text-slate-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
          Conseils et ce qui se passe ensuite
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center text-lg leading-none text-slate-400 transition group-open:rotate-45 group-open:text-white">
            +
          </span>
        </summary>
        <div className="space-y-3 pb-4 text-[13px] leading-relaxed text-slate-500">
          <p>
            Les publications programmées en fin d&apos;après-midi en semaine (17 h – 19 h) obtiennent souvent le plus
            d&apos;engagement — à ajuster selon vos propres statistiques une fois synchronisées (la Vue d&apos;ensemble
            vous indique votre meilleur créneau dès qu&apos;elle a assez d&apos;historique).
          </p>
          <ul className="space-y-1.5">
            <li>• Après l&apos;envoi, vous arrivez sur la fiche de la publication : statut par réseau, discussion et, sur YouTube, analyse de rétention par IA.</li>
            <li>• En mode programmé, le planificateur publie automatiquement à l&apos;heure prévue, dans le fuseau horaire de la marque.</li>
            <li>• Si un compte échoue, vous recevez un email (désactivable dans Paramètres → Notifications) et vous pouvez retenter l&apos;envoi depuis la fiche.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
