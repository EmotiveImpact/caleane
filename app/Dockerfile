# Build the client bundle, then ship only the server runtime.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# package.json installs pagedly from this local tarball.
COPY vendor ./vendor
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
# Required at runtime (the server refuses to bind publicly without it):
#   APP_ORIGIN     Public HTTPS origin of this deployment, for example https://app.caleane.com.
#                  Used for same-origin checks, Secure cookies, HSTS and links in email.
# Optional:
#   TRUST_PROXY=1  Number of reverse proxy hops whose X-Forwarded-For entries are trusted for rate limits.
#   DATABASE_PATH  Defaults to the volume below.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4320 DATABASE_PATH=/app/data/workspace.sqlite
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Every server module is a top-level .mjs file; the server also imports shared helpers from src/lib.
# scripts/check-image-imports.mjs verifies this list covers every import of server.mjs.
COPY --from=build /app/*.mjs ./
COPY --from=build /app/src/lib ./src/lib
COPY --from=build /app/public ./public
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
EXPOSE 4320
CMD ["node", "--experimental-sqlite", "server.mjs"]
