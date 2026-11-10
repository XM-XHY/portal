// 单元测试全局前置：固定 NODE_ENV=test 并注入随机测试密钥，
// 避免 lib/session.ts / lib/pay-grant.ts / lib/work-session.ts / lib/data/hash.ts
// 在生产 fail-fast 分支抛错（它们仅在 NODE_ENV==='production' 且缺密钥时 throw，test 不受影响）。
// 注意：lib/session.ts 与 lib/data/hash.ts 在模块加载时即解析密钥/盐，
// 因此本文件（setupFiles）必须在被测模块被 import 之前执行——Vitest 保证 setup 先于测试模块加载。
import crypto from "node:crypto";

process.env.NODE_ENV = "test";

const random32 = () => crypto.randomBytes(16).toString("hex"); // 32 位十六进制随机串

process.env.ADMIN_SESSION_SECRET = random32();
process.env.PAY_GRANT_SECRET = random32();
process.env.WORK_SESSION_SECRET = random32();
process.env.ADMIN_PASSWORD_SALT = random32();
