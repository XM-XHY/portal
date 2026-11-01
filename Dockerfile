# 腾讯云 CloudBase 云托管（CloudRun）部署用镜像
# 若使用 HTTP 云函数 + scf_bootstrap，则不需要本文件。
#
# 构建：docker build -t xm-tech-portal .
# 运行：docker run -p 9000:9000 --env-file .env.production xm-tech-portal

# ---- 构建阶段 ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

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

EXPOSE 9000

CMD ["node", "server.js"]
