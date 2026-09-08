# duizhangAgent frontend

业务 Web 前端，生产入口为 `/yuanji/`。

## Local

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

## Remote

创建远端仓库后执行：

```bash
git remote add origin <frontend-git-url>
git push -u origin main
```

## Production webhook

服务器路径默认使用 `/opt/duizhangAgent-frontend`，webhook 监听 `127.0.0.1:9010`，公网路径由后端仓库的 Nginx 总入口转发到 `/deploy/frontend-webhook`。

```bash
cp .env.production.example .env.production
sudo APP_DIR=/opt/duizhangAgent-frontend bash deploy/install_webhook_service.sh
```
