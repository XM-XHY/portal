# 腾讯云 CloudBase 云托管（CloudRun）部署用镜像
# 若使用 HTTP 云函数 + scf_bootstrap，则不需要本文件。
#
# 构建：docker build -t xm-tech-portal .
# 运行：docker run -p 9000:9000 --env-file .env.production xm-tech-portal

# ---- 构建阶段 ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
# 云端构建机偶发 ECONNRESET（registry 抖动），故设置较长超时 + 多次重试，
# 并保留国内镜像源作为兜底，避免整次部署因网络瞬断失败。
RUN (npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000 \
  || npm install --registry=https://registry.npmmirror.com --fetch-retries=5 --fetch-retry-maxtimeout=120000 --fetch-timeout=600000 \
  || npm install --fetch-retries=8 --fetch-timeout=600000)

COPY . .

# standalone 产物：不依赖完整 node_modules，镜像更小
ENV BUILD_TARGET=cloudbase
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:cloudbase

# ---- 运行阶段 ----
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=9000
ENV NEXT_TELEMETRY_DISABLED=1

# standalone 目录已由 postbuild 补齐 .next/static 与 public
COPY --from=builder /app/.next/standalone ./

# 商户私钥/平台证书等凭据文件（以文件方式提供，避免在环境变量里粘贴多行 PEM）
# 该目录已在 .gitignore 中，不会进入版本库；缺失时代码会降级为环境变量读取。
COPY --from=builder /app/credentials ./credentials

EXPOSE 9000

CMD ["node", "server.js"]
