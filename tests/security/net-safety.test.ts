import { describe, expect, it } from "vitest";
import { checkUrlShape, fetchPublic, isPrivateIp, safeLookup, UnsafeUrlError } from "@/lib/net-safety";

describe("anti-SSRF : classement des adresses", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "::1", "::", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::7f00:1", "::127.0.0.1",
    "2002:7f00:1::", "2001:0:4136:e378::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "pas-une-ip"
  ])("%s est refusée", (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "151.101.1.69", "2606:4700:4700::1111", "2a00:1450:4007:80f::200e"])("%s est publique", (ip) =>
    expect(isPrivateIp(ip)).toBe(false)
  );
});

describe("anti-SSRF : forme des adresses", () => {
  it.each([
    "http://example.com/",
    "https://localhost/x",
    "https://service.internal/",
    "https://[::ffff:127.0.0.1]/",
    "https://[::1]:8080/",
    "https://2130706433/",
    "https://0x7f.1/",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/"
  ])("%s est refusée", (url) => expect(() => checkUrlShape(url)).toThrow(UnsafeUrlError));

  it("accepte une adresse https publique", () => {
    expect(checkUrlShape("https://example.com/image.png").hostname).toBe("example.com");
  });
});

describe("anti-SSRF : vérification au moment de la connexion", () => {
  it("la résolution DNS refuse un nom qui pointe vers une adresse privée", async () => {
    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => safeLookup("localhost", { all: true }, (e) => resolve(e)));
    expect(err?.code).toBe("EPRIVATEADDRESS");
  });

  it("fetchPublic refuse les IP privées écrites en clair", async () => {
    await expect(fetchPublic("https://127.0.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(fetchPublic("https://[::ffff:127.0.0.1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
