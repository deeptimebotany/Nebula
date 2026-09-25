import { randomBytes } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { currentSecretPrefix, openSecret, resetSecretKeysForTests, sealSecret, SecretKeyError } from "@/lib/crypto/secret-box";
import { openReadTree, sealWriteTree } from "@/lib/db/secret-fields";

const key = () => randomBytes(32).toString("base64");
function useKeys(current?: string, previous?: string) {
  if (current) process.env.TOKEN_ENCRYPTION_KEY = current;
  else delete process.env.TOKEN_ENCRYPTION_KEY;
  if (previous) process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS = previous;
  else delete process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  resetSecretKeysForTests();
}
afterEach(() => useKeys());

describe("chiffrement des secrets (AES-256-GCM)", () => {
  it("chiffre puis déchiffre, avec un IV différent à chaque fois", () => {
    useKeys(key());
    const a = sealSecret("jeton-123", "accessToken");
    const b = sealSecret("jeton-123", "accessToken");
    expect(a).toMatch(/^enc:v1:[0-9a-f]{8}:/);
    expect(a).not.toContain("jeton-123");
    expect(a).not.toBe(b);
    expect(openSecret(a, "accessToken")).toBe("jeton-123");
  });

  it("refuse une valeur déplacée vers un autre champ", () => {
    useKeys(key());
    const sealed = sealSecret("rt", "refreshToken");
    expect(() => openSecret(sealed, "accessToken")).toThrow(SecretKeyError);
  });

  it("refuse une valeur altérée", () => {
    useKeys(key());
    const sealed = sealSecret("abc", "accessToken");
    const parts = sealed.split(":");
    parts[4] = Buffer.from("zzz").toString("base64url");
    expect(() => openSecret(parts.join(":"), "accessToken")).toThrow(SecretKeyError);
  });

  it("sans clé : valeurs laissées en clair et relues telles quelles", () => {
    useKeys();
    expect(sealSecret("plain", "accessToken")).toBe("plain");
    expect(openSecret("plain", "accessToken")).toBe("plain");
    expect(currentSecretPrefix()).toBeNull();
  });

  it("rotation : l'ancienne clé reste lisible via TOKEN_ENCRYPTION_KEY_PREVIOUS", () => {
    const k1 = key();
    useKeys(k1);
    const sealed = sealSecret("x", "secret");
    useKeys(key(), k1);
    expect(openSecret(sealed, "secret")).toBe("x");
    useKeys(key());
    expect(() => openSecret(sealed, "secret")).toThrow(/n'est pas configurée/);
  });

  it("refuse une clé de mauvaise taille", () => {
    useKeys("trop-courte");
    expect(() => sealSecret("x", "secret")).toThrow(/32 octets/);
  });

  it("chiffre les champs secrets des écritures, y compris imbriquées, sans toucher aux filtres", () => {
    useKeys(key());
    const args = {
      data: { accessToken: "a", refreshToken: { set: "r" }, displayName: "N", connections: { create: [{ accessToken: "b" }] } },
      where: { accessToken: "filtre" }
    };
    const sealedData = sealWriteTree(args.data) as Record<string, any>;
    expect(sealedData.accessToken).toMatch(/^enc:v1:/);
    expect(sealedData.refreshToken.set).toMatch(/^enc:v1:/);
    expect(sealedData.displayName).toBe("N");
    expect(sealedData.connections.create[0].accessToken).toMatch(/^enc:v1:/);
    expect(args.data.accessToken).toBe("a"); // l'objet de l'appelant n'est pas modifié
    expect(sealWriteTree({ where: { accessToken: "f" } })).toEqual({ where: { accessToken: "f" } });
    const read = openReadTree({ posts: [{ targets: [{ connection: { accessToken: sealedData.accessToken, at: new Date(0) } }] }] }) as any;
    expect(read.posts[0].targets[0].connection.accessToken).toBe("a");
    expect(read.posts[0].targets[0].connection.at).toBeInstanceOf(Date);
  });
});
