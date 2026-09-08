FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

ARG VITE_PUBLIC_BASE_PATH=/
ARG VITE_ANALYTICS_DAILY_FACT_V2=false
ENV VITE_PUBLIC_BASE_PATH=$VITE_PUBLIC_BASE_PATH
ENV VITE_ANALYTICS_DAILY_FACT_V2=$VITE_ANALYTICS_DAILY_FACT_V2

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile || (pnpm approve-builds --all && pnpm rebuild esbuild)

COPY . .
RUN pnpm build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/yuanji/ >/dev/null || wget -qO- http://127.0.0.1/ >/dev/null || exit 1
