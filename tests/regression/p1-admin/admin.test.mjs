/**
 * p1-admin 回归套件（后台鉴权与初始凭据，tag=p1）。
 *
 * 覆盖：
 *   - signSession / verifyToken 往返一致
 *   - 篡改签名后 verifyToken 返回 null（防伪造后台会话）
 *   - 非法 / 空 token 返回 null
 *   - initialAdminPassword 未配置时返回随机非空前值（拒绝写死口令）
 *   - initialAdminPassword 已配置时返回该配置值
 *
 * 通过 loadTs 导入真实的 lib/session（桩 next/headers）与 lib/data/defaults。
 * 任一断言失败 -> exit(1)；全部通过 -> exit(0)。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTs, supportFile } from "../../_support/loadTs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEXT_HEADERS_STUB = supportFile("stub-next-headers.mjs");
const STORE_MOCK = supportFile("mock-store.mjs");

const results = [];
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    results.push({ name, ok: true });
  } else {
    console.log(`  FAIL  ${name}${detail ? `  ::  ${detail}` : ""}`);
    results.push({ name, ok: false });
  }
}

async function main() {
  // session.ts 还会 import @/lib/store（仅 getAdminFromCookie 内使用，此处一并隔离）
  const sessionMock = { "next/headers": NEXT_HEADERS_STUB, "@/lib/store": STORE_MOCK };
  const { signSession, verifyToken } = await loadTs("@/lib/session", { stub: sessionMock });
  const { initialAdminPassword } = await loadTs("@/lib/data/defaults", {});

  // ---- P1-1 往返一致 ----
  console.log("[p1-admin] P1-1 signSession/verifyToken 往返");
  const token = signSession("a1");
  check("签名后可验回原 adminId", verifyToken(token) === "a1", token);

  // ---- P1-2 篡改签名 ----
  console.log("[p1-admin] P1-2 篡改签名");
  const [body, sig] = token.split(".");
  const tampered = `${body}.${sig.slice(0, -1)}X`; // 末尾改动，几乎必然破坏 HMAC
  check("篡改签名后 verifyToken 返回 null", verifyToken(tampered) === null);

  // ---- P1-3 非法 / 空 ----
  console.log("[p1-admin] P1-3 非法/空 token");
  check("undefined -> null", verifyToken(undefined) === null);
  check("无点号字符串 -> null", verifyToken("garbage") === null);
  check("格式错误字符串 -> null", verifyToken("a.b.c.d") === null);

  // ---- P1-4 未配置随机回落 ----
  console.log("[p1-admin] P1-4 initialAdminPassword 未配置随机回落");
  delete process.env.INITIAL_ADMIN_PASSWORD;
  const rp = initialAdminPassword();
  check("未配置时返回非空前值", typeof rp === "string" && rp.length > 0, rp);
  check("未配置时以 XHY- 前缀的随机值", typeof rp === "string" && rp.startsWith("XHY-"), rp);

  // ---- P1-5 已配置返回值（用 fresh 实例避免模块级缓存串扰）----
  console.log("[p1-admin] P1-5 initialAdminPassword 已配置返回值");
  process.env.INITIAL_ADMIN_PASSWORD = "fixed-secret-from-env";
  const { initialAdminPassword: iapFresh } = await loadTs("@/lib/data/defaults", { fresh: true });
  const cp = iapFresh();
  check("已配置时返回该配置值", cp === "fixed-secret-from-env", cp);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[p1-admin] 通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`[p1-admin] 失败项：${failed.map((f) => f.name).join("; ")}`);
    console.log("[p1-admin] EXIT 1");
    process.exit(1);
  }
  console.log("[p1-admin] EXIT 0");
  process.exit(0);
}

main().catch((e) => {
  console.error("[p1-admin] 运行异常：", e);
  console.log("[p1-admin] EXIT 1");
  process.exit(1);
});
