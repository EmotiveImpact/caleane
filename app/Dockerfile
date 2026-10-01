FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs /app/store.mjs /app/crm.mjs /app/relationships.mjs ./
COPY --from=build /app/src/lib/workflows.js ./src/lib/workflows.js
COPY --from=build /app/public/embed.js ./public/embed.js
EXPOSE 4320
CMD ["npm", "start"]
