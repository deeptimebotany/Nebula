"use client";

// Sélecteurs fournis par Google (Google Picker) et Dropbox (Dropbox
// Chooser), chargés à la demande depuis leurs serveurs (lot 3, 25/09/2026).
// Les scripts sont préchargés dès l'affichage de la barre d'import, pour que
// la fenêtre de connexion s'ouvre directement au clic (sinon le navigateur
// la bloque comme une fenêtre surgissante non demandée).

/* Types minimaux des objets globaux injectés par ces scripts. */
interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface GoogleTokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
  callback: (r: GoogleTokenResponse) => void;
}
interface PickerDoc {
  id: string;
  name: string;
  mimeType: string;
}
interface PickerData {
  action: string;
  docs?: PickerDoc[];
}
interface PickerNamespace {
  ViewId: { DOCS_IMAGES_AND_VIDEOS: string };
  Action: { PICKED: string; CANCEL: string };
  DocsView: new (viewId: string) => { setIncludeFolders(v: boolean): unknown; setSelectFolderEnabled(v: boolean): unknown };
  PickerBuilder: new () => PickerBuilderLike;
}
interface PickerBuilderLike {
  setAppId(id: string): PickerBuilderLike;
  setOAuthToken(t: string): PickerBuilderLike;
  setDeveloperKey(k: string): PickerBuilderLike;
  addView(v: unknown): PickerBuilderLike;
  setLocale(l: string): PickerBuilderLike;
  setTitle(t: string): PickerBuilderLike;
  setCallback(cb: (data: PickerData) => void): PickerBuilderLike;
  build(): { setVisible(v: boolean): void };
}
interface GoogleGlobals {
  gapi?: { load(name: string, cb: () => void): void };
  google?: {
    accounts?: { oauth2?: { initTokenClient(cfg: { client_id: string; scope: string; callback: (r: GoogleTokenResponse) => void; error_callback?: (e: { type?: string }) => void }): GoogleTokenClient } };
    picker?: PickerNamespace;
  };
  Dropbox?: {
    appKey?: string;
    choose(options: {
      success: (files: { link: string; name: string; bytes: number }[]) => void;
      cancel?: () => void;
      linkType: "direct" | "preview";
      multiselect: boolean;
      extensions?: string[];
      folderselect?: boolean;
    }): void;
  };
}

const w = () => window as unknown as GoogleGlobals;
const loaded = new Map<string, Promise<void>>();

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  const existing = loaded.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => {
      loaded.delete(src);
      reject(new Error("Impossible de charger le sélecteur. Vérifiez votre connexion ou un bloqueur de contenu."));
    };
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

// --- Google Drive ------------------------------------------------------------

export interface GoogleDriveConfig {
  apiKey: string;
  clientId: string;
  appId: string;
}

export interface PickedDriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  accessToken: string;
}

let tokenClient: GoogleTokenClient | null = null;
let cachedToken: { value: string; until: number } | null = null;

export async function preloadGoogleDrive(cfg: GoogleDriveConfig): Promise<void> {
  await Promise.all([loadScript("https://apis.google.com/js/api.js"), loadScript("https://accounts.google.com/gsi/client")]);
  await new Promise<void>((resolve) => w().gapi!.load("picker", () => resolve()));
  if (!tokenClient) {
    tokenClient = w().google!.accounts!.oauth2!.initTokenClient({
      client_id: cfg.clientId,
      // drive.file : seulement les fichiers que la personne choisit elle-même.
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: () => undefined
    });
  }
}

function openPicker(cfg: GoogleDriveConfig, token: string): Promise<PickedDriveFile | null> {
  return new Promise((resolve) => {
    const picker = w().google!.picker!;
    const view = new picker.DocsView(picker.ViewId.DOCS_IMAGES_AND_VIDEOS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    new picker.PickerBuilder()
      .setAppId(cfg.appId)
      .setOAuthToken(token)
      .setDeveloperKey(cfg.apiKey)
      .addView(view)
      .setLocale("fr")
      .setTitle("Choisir une image ou une vidéo")
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED && data.docs?.[0]) {
          const d = data.docs[0];
          resolve({ fileId: d.id, name: d.name, mimeType: d.mimeType, accessToken: token });
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}

/**
 * À appeler DIRECTEMENT dans le clic (après preloadGoogleDrive) : ouvre la
 * fenêtre d'autorisation Google si besoin, puis le sélecteur de fichiers.
 */
export function pickFromGoogleDrive(cfg: GoogleDriveConfig): Promise<PickedDriveFile | null> {
  if (cachedToken && cachedToken.until > Date.now()) return openPicker(cfg, cachedToken.value);
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("Le sélecteur Google Drive se charge encore : réessayez dans une seconde."));
      return;
    }
    tokenClient.callback = (r) => {
      if (!r.access_token) {
        reject(new Error(r.error === "access_denied" ? "Accès à Google Drive refusé." : "Connexion à Google Drive impossible."));
        return;
      }
      cachedToken = { value: r.access_token, until: Date.now() + Math.max(60, (r.expires_in ?? 3600) - 120) * 1000 };
      openPicker(cfg, r.access_token).then(resolve, reject);
    };
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// --- Dropbox -----------------------------------------------------------------

export async function preloadDropbox(appKey: string): Promise<void> {
  await loadScript("https://www.dropbox.com/static/api/2/dropins.js", { id: "dropboxjs", "data-app-key": appKey });
  const dbx = w().Dropbox;
  if (dbx && !dbx.appKey) dbx.appKey = appKey;
}

export interface PickedDropboxFile {
  url: string;
  name: string;
}

/** À appeler directement dans le clic (après preloadDropbox). */
export function pickFromDropbox(): Promise<PickedDropboxFile | null> {
  return new Promise((resolve, reject) => {
    const dbx = w().Dropbox;
    if (!dbx) {
      reject(new Error("Le sélecteur Dropbox se charge encore : réessayez dans une seconde."));
      return;
    }
    dbx.choose({
      linkType: "direct",
      multiselect: false,
      folderselect: false,
      extensions: ["images", "video"],
      success: (files) => resolve(files[0] ? { url: files[0].link, name: files[0].name } : null),
      cancel: () => resolve(null)
    });
  });
}
