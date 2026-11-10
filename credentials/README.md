# 支付凭据目录

存放微信支付 / 支付宝的**密钥文件**，供服务端以文件方式读取（避免在环境变量里粘贴多行 PEM 导致换行损坏）。

> ⚠️ **此目录下的 `.pem` / `.p12` / `.key` / `.crt` 文件已在 `.gitignore` 中，不会被提交到 Git。**
> 请勿手动 force-add，也不要把私钥贴进聊天或工单。

## 文件约定

| 文件名 | 对应环境变量 | 说明 |
|---|---|---|
| `apiclient_key.pem` | `WECHAT_PAY_PRIVATE_KEY_FILE` | 商户 API 证书私钥（申请 API 证书时由证书工具生成，**只能导出一次，丢失需重新申请**） |
| `wechatpay_platform.pem` | `WECHAT_PAY_CERT_FILE` | 微信支付平台证书（传统验签方式，需 5 年更换一次） |
| `wechatpay_pubkey.pem` | `WECHAT_PAY_PUBKEY_FILE` | **微信支付公钥（推荐）**，配 `WECHAT_PAY_PUBKEY_ID` 使用 |

## 优先级

代码优先读文件，读不到再用同名环境变量（`WECHAT_PAY_PRIVATE_KEY` 等）。
路径可以是绝对路径，或相对进程工作目录（CloudBase standalone 下为 `/app`）。

## 获取方式

详见 `DEPLOY-CLOUDBASE.md` 的「微信支付」章节：

- 商户私钥：微信支付商户平台 → 账户中心 → API 安全 → 申请商户 API 证书（证书工具生成的 `apiclient_key.pem`）
- 微信支付公钥：商户平台 → 账户中心 → API 安全 → **申请公钥 / 管理公钥**（可下载公钥并查看公钥 ID）

## Docker 构建注意

`Dockerfile` 中有 `COPY --from=builder /app/credentials ./credentials`，
因此**本目录必须存在**（本 README 保证了这一点），否则镜像构建会失败。缺失的密钥文件不影响构建，
代码会在运行时降级为读取环境变量。
