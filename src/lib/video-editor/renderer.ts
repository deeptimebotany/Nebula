// Rendu d'une image de la vidéo modifiée (éditeur vidéo de Publier,
// 30/09/2026), en WebGL : géométrie (quart de tour, retournements, rotation
// fine, zoom, recadrage, dimensions) par une matrice « pixel de sortie →
// position dans la vidéo d'origine », puis netteté, filtre, réglages et
// vignette dans un seul fragment shader. Le même rendu sert à l'aperçu
// (image de la balise <video>) et à l'export (images décodées une à une) :
// ce que l'on voit est ce que l'on obtient.
import { filterMatrix, shaderParams, sourceMatrix, type Affine, type FilterId, type VideoEdit } from "./model";

const VERTEX = `
attribute vec2 aPos;
uniform vec2 uOut;
varying vec2 vOut;
void main() {
  vec2 t = aPos * 0.5 + 0.5;
  vOut = vec2(t.x * uOut.x, (1.0 - t.y) * uOut.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vOut;
uniform sampler2D uTex;
uniform mat3 uM;
uniform vec2 uOut;
uniform vec2 uTexel;
uniform vec4 uCm0;
uniform vec4 uCm1;
uniform vec4 uCm2;
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uTemperature;
uniform float uGamma;
uniform float uSharp;
uniform float uVignette;

vec3 samp(vec2 uv) { return texture2D(uTex, uv).rgb; }

void main() {
  vec2 uv = (uM * vec3(vOut, 1.0)).xy;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 c = samp(uv);
  if (uSharp > 0.0) {
    vec3 blur = (samp(uv + vec2(uTexel.x, 0.0)) + samp(uv - vec2(uTexel.x, 0.0)) + samp(uv + vec2(0.0, uTexel.y)) + samp(uv - vec2(0.0, uTexel.y))) * 0.25;
    c = c + uSharp * (c - blur);
  }
  c = vec3(dot(uCm0.xyz, c) + uCm0.w, dot(uCm1.xyz, c) + uCm1.w, dot(uCm2.xyz, c) + uCm2.w);
  c *= uExposure;
  c += uBrightness;
  c = (c - 0.5) * uContrast + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c.r *= 1.0 + uTemperature;
  c.g *= 1.0 + uTemperature * 0.15;
  c.b *= 1.0 - uTemperature;
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0 / uGamma));
  if (uVignette != 0.0) {
    vec2 q = (vOut - uOut * 0.5) / (0.5 * length(uOut));
    float v = smoothstep(0.45, 1.0, length(q)) * abs(uVignette) * 0.85;
    c = uVignette > 0.0 ? c * (1.0 - v) : mix(c, vec3(1.0), v);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class VideoEditorUnsupportedError extends Error {}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new VideoEditorUnsupportedError("WebGL indisponible.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new VideoEditorUnsupportedError(`Rendu vidéo indisponible (${log ?? "shader"}).`);
  }
  return shader;
}

export interface RenderOptions {
  outW: number;
  outH: number;
  /** Image entière sans recadrage (outil Recadrer). */
  wholeFrame?: boolean;
  /** Filtre à la place de celui de la modification (vignettes des filtres). */
  filter?: FilterId;
  /** Sans réglages ni filtre (vignettes). */
  plain?: boolean;
}

export class EditRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement = document.createElement("canvas")) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new VideoEditorUnsupportedError("Ce navigateur ne permet pas le rendu vidéo (WebGL désactivé).");
    this.gl = gl;
    const program = gl.createProgram();
    if (!program) throw new VideoEditorUnsupportedError("WebGL indisponible.");
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new VideoEditorUnsupportedError("Rendu vidéo indisponible (programme WebGL).");
    this.program = program;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) throw new VideoEditorUnsupportedError("WebGL indisponible.");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    for (const name of ["uTex", "uM", "uOut", "uTexel", "uCm0", "uCm1", "uCm2", "uExposure", "uBrightness", "uContrast", "uSaturation", "uTemperature", "uGamma", "uSharp", "uVignette"]) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }
  }

  /**
   * Rend une image. `source` : balise <video>, canvas, image… de taille
   * texW × texH ; `srcW` × `srcH` : taille de référence de la vidéo pour
   * laquelle le recadrage a été défini (celle de l'éditeur).
   */
  render(source: TexImageSource, texW: number, texH: number, edit: VideoEdit, srcW: number, srcH: number, opts: RenderOptions): void {
    const { gl } = this;
    const outW = Math.max(2, Math.round(opts.outW));
    const outH = Math.max(2, Math.round(opts.outH));
    if (this.canvas.width !== outW) this.canvas.width = outW;
    if (this.canvas.height !== outH) this.canvas.height = outH;
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    const m: Affine = sourceMatrix(edit, srcW, srcH, outW, outH, opts.wholeFrame);
    // mat3 en colonnes : (a, b, 0), (c, d, 0), (e, f, 1).
    gl.uniformMatrix3fv(this.loc.uM, false, new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform2f(this.loc.uOut, outW, outH);
    gl.uniform2f(this.loc.uTexel, 1 / Math.max(1, texW), 1 / Math.max(1, texH));

    const cm = filterMatrix(opts.plain ? "none" : (opts.filter ?? edit.filter));
    gl.uniform4f(this.loc.uCm0, cm[0], cm[1], cm[2], cm[3]);
    gl.uniform4f(this.loc.uCm1, cm[4], cm[5], cm[6], cm[7]);
    gl.uniform4f(this.loc.uCm2, cm[8], cm[9], cm[10], cm[11]);
    const p = shaderParams(opts.plain ? { brightness: 0, contrast: 0, saturation: 0, exposure: 0, temperature: 0, gamma: 0, sharpness: 0, vignette: 0 } : edit.adjust);
    gl.uniform1f(this.loc.uExposure, p.exposure);
    gl.uniform1f(this.loc.uBrightness, p.brightness);
    gl.uniform1f(this.loc.uContrast, p.contrast);
    gl.uniform1f(this.loc.uSaturation, p.saturation);
    gl.uniform1f(this.loc.uTemperature, p.temperature);
    gl.uniform1f(this.loc.uGamma, p.gamma);
    gl.uniform1f(this.loc.uSharp, p.sharpness);
    gl.uniform1f(this.loc.uVignette, p.vignette);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose(): void {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
