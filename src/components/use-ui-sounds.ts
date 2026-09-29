"use client";

// Sons de l'interface (lot U5) : réglage du compte + Mode focus, lus ici
// pour que chaque appel reste d'une ligne : `play("tick", { allowInFocus: true })`.
import { useCallback, useEffect } from "react";
import { useBootstrap, useFocusMode } from "@/components/bootstrap-provider";
import { installUiSoundGesture, playUiSound, type UiSound } from "@/lib/ui-sounds";

export function useUiSounds() {
  const { data: me } = useBootstrap();
  const { focusMode } = useFocusMode();
  useEffect(() => installUiSoundGesture(), []);
  const enabled = me?.uiSounds !== false;
  const play = useCallback((kind: UiSound, opts: { allowInFocus?: boolean } = {}) => playUiSound(kind, { enabled, focusMode, allowInFocus: opts.allowInFocus }), [enabled, focusMode]);
  return { enabled, play };
}
