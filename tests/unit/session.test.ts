import { describe, it, expect, vi } from "vitest";

// 隔离 next/headers 与数据层（lib/store → lib/data），避免加载 Next 内部与数据库连接。
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/store", () => ({
  getAdmins: vi.fn(),
  getContents: vi.fn(),
  getContent: vi.fn(),
  saveContents: vi.fn(),
}));

import { signSession, verifyToken } from "@/lib/session";

describe("session: sign/verify", () => {
  it("signSession → verifyToken 往返", () => {
    const id = "admin-123";
    const token = signSession(id);
    expect(token).toContain(".");
    expect(verifyToken(token)).toBe(id);
  });

  it("签名被篡改（等长翻转）返回 null（timingSafeEqual 路径）", () => {
    const token = signSession("admin-1");
    const [idB64, sig] = token.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyToken(`${idB64}.${flipped}`)).toBeNull();
  });

  it("签名被篡改（长度不符）返回 null", () => {
    const token = signSession("admin-1");
    const [idB64] = token.split(".");
    const fakeSig = Buffer.from("x").toString("base64url").repeat(8);
    expect(verifyToken(`${idB64}.${fakeSig}`)).toBeNull();
  });

  it("verifyToken('') 返回 null", () => {
    expect(verifyToken("")).toBeNull();
  });

  it("verifyToken(undefined) 返回 null", () => {
    expect(verifyToken(undefined)).toBeNull();
  });

  it("缺少分隔符的 token 返回 null", () => {
    expect(verifyToken("notatoken")).toBeNull();
  });
});
