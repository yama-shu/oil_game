# 本番配信用イメージ。
# マルチステージビルドで、最終イメージには静的ファイルと nginx のみを含める。

# --- ビルドステージ ---
FROM node:24-slim AS build
WORKDIR /app

# 依存関係だけ先にコピーしてインストールし、レイヤキャッシュを効かせる
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY tests ./tests
RUN npm run build

# --- 配信ステージ ---
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
