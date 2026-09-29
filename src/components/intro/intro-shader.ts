// Shader de l'intro de création de compte (WebGL 1, calculé par la carte
// graphique pour chaque pixel de l'écran). Uniformes : voir IntroFrame
// dans src/lib/intro/timeline.ts. Porté tel quel depuis la maquette validée
// par Lucas le 29/09/2026 (intro-nebula.html).
export const INTRO_VERTEX_SHADER = "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }";

export const INTRO_FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2  uRes;     // taille du canevas en pixels réels
uniform float uDpr;
uniform float uTime;
uniform float uS;       // taille de l'icône (px CSS)
uniform float uAng;     // rotation des anneaux (radians)
uniform float uWarp;    // déformation (px CSS)
uniform float uAb;      // franges de couleur
uniform float uRingA;   // opacité des anneaux du canevas
uniform float uBlobR;   // rayon de l'aura (px CSS)
uniform float uBlobA;   // opacité de l'aura
uniform float uHole;    // rayon du trou (px CSS) quand l'aura s'ouvre en anneau
uniform float uGloss;   // reflet sur les anneaux (disparaît quand ils se posent)

const vec3 BG = vec3(0.984, 0.984, 0.980);

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// Version douce (2 octaves) pour la lentille : courbes lisses, sans bords déchirés
float fbm2(vec2 p) { return 0.62 * noise(p) + 0.26 * noise(p * 2.03 + 11.7); }

// Dégradé officiel des anneaux (cyan → bleu → violet → rose)
vec3 ringGrad(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c0 = vec3(0.373, 0.878, 0.941), c1 = vec3(0.478, 0.584, 1.0), c2 = vec3(0.627, 0.4, 1.0), c3 = vec3(0.941, 0.384, 0.816);
  if (x < 0.35) return mix(c0, c1, x / 0.35);
  if (x < 0.6)  return mix(c1, c2, (x - 0.35) / 0.25);
  return mix(c2, c3, (x - 0.6) / 0.4);
}
// Palette cyclique de l'aura (couleurs Nebula, en pastel)
vec3 palAt(int k) {
  if (k == 0) return vec3(0.62, 0.97, 0.88);  // menthe
  if (k == 1) return vec3(0.52, 0.91, 0.98);  // cyan
  if (k == 2) return vec3(0.62, 0.72, 1.00);  // pervenche
  if (k == 3) return vec3(0.75, 0.58, 1.00);  // violet
  return vec3(0.99, 0.62, 0.89);              // rose
}
// Aller-retour dans la palette (jamais de passage direct rose → menthe, qui salit)
vec3 auraPal(float h) {
  float x = (1.0 - abs(fract(h) * 2.0 - 1.0)) * 3.999;
  float fi = floor(x);
  int i = int(fi);
  return mix(palAt(i), palAt(i + 1), smoothstep(0.0, 1.0, x - fi));
}

// Les trois anneaux du logo (mêmes proportions que le SVG) ; couleur prémultipliée
vec4 rings(vec2 px) {
  vec2 p = px / uS * 32.0;
  float c = cos(uAng), s = sin(uAng);
  p = mat2(c, -s, s, c) * p;
  float aa = 32.0 / uS * (0.8 + 16.0 * uGloss); // bords doux et lumineux tant que les anneaux sont immenses
  vec4 col = vec4(0.0);
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 1.0471976;
    float ca = cos(a), sa = sin(a);
    vec2 q = mat2(ca, -sa, sa, ca) * p;
    vec2 r = vec2(14.3, 6.4);
    float k0 = length(q / r), k1 = length(q / (r * r));
    // Tout près du centre, la formule devient 0/0 (point parasite) : on sait
    // qu'on est loin à l'intérieur de l'ellipse.
    float d = k0 < 0.05 ? -6.4 : k0 * (k0 - 1.0) / k1;
    float cov = 1.0 - smoothstep(1.7 - aa, 1.7 + aa, abs(d));
    vec3 cc = ringGrad(q.x / 28.6 + 0.5);
    float g = 1.0 - clamp(abs(d) / 1.7, 0.0, 1.0);
    cc = mix(cc, vec3(1.0), uGloss * 0.35 * g * g) * (1.0 - uGloss * 0.18 * (1.0 - g));
    col.rgb = cc * cov + col.rgb * (1.0 - cov);
    col.a = cov + col.a * (1.0 - cov);
  }
  return col;
}

// L'aura organique : contour qui ondule, couleurs irisées, liseré brillant
vec4 aura(vec2 px) {
  if (uBlobA <= 0.001 || uBlobR <= 1.0) return vec4(0.0);
  float r = length(px), th = atan(px.y, px.x), t = uTime;
  vec2 dir = vec2(cos(th), sin(th));
  float wob = 0.11 * sin(3.0 * th + t * 1.15) + 0.07 * sin(5.0 * th - t * 1.7 + 1.3)
            + 0.05 * sin(2.0 * th + t * 0.8 + 2.1) + 0.16 * fbm(dir * 1.2 + vec2(t * 0.22, -t * 0.17));
  float R = uBlobR * (1.0 + wob);
  float soft = uBlobR * 0.42;
  float inside = 1.0 - smoothstep(R - soft, R + soft * 0.55, r);
  float h = th / 6.2831 + r / uBlobR * 0.28 + t * 0.06 + fbm(px * 0.0035 + t * 0.18) * 0.55;
  vec3 col = auraPal(h);
  float rim = exp(-pow((r - R * 0.93) / (uBlobR * 0.075), 2.0));
  col = mix(col, auraPal(h + 0.4), rim * 0.55) + rim * 0.10;
  float hole = uHole > 0.0 ? smoothstep(uHole - soft * 0.9, uHole + soft * 0.35, r) : 1.0;
  float a = inside * hole * uBlobA * 0.9;
  return vec4(col * a, a);
}

void main() {
  vec2 px = (gl_FragCoord.xy - uRes * 0.5) / uDpr;
  px.y = -px.y; // repère de l'écran (y vers le bas), comme le SVG

  // Déformation « lentille liquide » : champ de bruit qui coule
  vec2 w = vec2(fbm2(px * 0.0016 + vec2(uTime * 0.45, 0.0)), fbm2(px * 0.0016 + vec2(4.7, -uTime * 0.45)));
  // + effet de lentille : le centre gonfle, les bords s'étirent
  float rr = length(px) / max(uRes.x, uRes.y) * uDpr;
  vec2 pw = px * (1.0 - uWarp / 900.0 * 0.35 * (1.0 - rr)) + uWarp * w * 2.4;

  // Aura (derrière), légèrement déformée elle aussi
  vec4 au = aura(px + w * uBlobR * 0.08);
  vec3 col = au.rgb + BG * (1.0 - au.a);

  // Anneaux, avec franges de couleur (chaque canal lu à une distance du centre un peu différente)
  if (uRingA > 0.001) {
    vec4 sr = rings(pw * (1.0 + uAb));
    vec4 sg = rings(pw);
    vec4 sb = rings(pw * (1.0 - uAb));
    vec3 over = vec3(sr.r + col.r * (1.0 - sr.a), sg.g + col.g * (1.0 - sg.a), sb.b + col.b * (1.0 - sb.a));
    col = mix(col, over, uRingA);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
