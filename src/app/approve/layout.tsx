import { ForcedDarkMode } from "@/components/forced-dark-mode";

// Design propre : jamais les règles du mode clair (voir src/lib/color-mode.ts).
export default function OwnDesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ForcedDarkMode />
      {children}
    </>
  );
}
