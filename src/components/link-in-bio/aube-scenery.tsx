// Décor « Crêtes » du thème de page bio Aube (08/10/2026, proposition B
// choisie par Lucas) : ciel de lever de soleil pêche et rose, soleil qui
// respire derrière quatre rangées de montagnes (du rose au prune) qui
// bougent à peine, comme dans la brume, et deux oiseaux qui traversent le
// ciel. Tout en CSS et SVG (globals.css, « Thème Aube »), sans script ;
// animations coupées avec « réduire les animations ».
//
// Le parent choisit la position : `fixed inset-0` sur la vraie page (le
// décor reste en place pendant le défilement), `absolute inset-0` dans
// l'aperçu de l'éditeur. Toujours derrière le contenu (z-index -1 dans un
// parent `isolate`).
import type { CSSProperties } from "react";
import { clsx } from "@/lib/clsx";

export function AubeScenery({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" data-scenery="aube" className={clsx("aube-scenery pointer-events-none overflow-hidden", className)} style={style}>
      <div className="aube-sun" />
      <span className="aube-bird" />
      <span className="aube-bird aube-bird-2" />
      <svg className="aube-ridges" viewBox="0 0 400 380" preserveAspectRatio="none">
        <path className="aube-ridge aube-ridge-3" fill="#a24a6c" d="M0 118 L30 96 L58 110 L92 70 L128 100 L160 78 L198 108 L236 66 L270 98 L306 80 L340 104 L372 76 L400 96 L400 380 L0 380Z" />
        <path className="aube-ridge aube-ridge-2" fill="#6e2b62" d="M0 168 L38 138 L76 162 L118 126 L160 166 L204 134 L246 160 L290 130 L330 158 L366 136 L400 150 L400 380 L0 380Z" />
        <path className="aube-ridge" fill="#4a1b4f" d="M0 224 L44 194 L90 218 L134 186 L182 224 L228 196 L276 222 L320 192 L362 218 L400 200 L400 380 L0 380Z" />
        <path fill="#2c0f33" d="M0 290 L56 262 L112 286 L170 258 L228 284 L288 260 L344 286 L400 266 L400 380 L0 380Z" />
      </svg>
    </div>
  );
}
