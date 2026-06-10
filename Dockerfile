# Multi-stage build for accountant
# Pinned to Node 20 LTS — Angular 19 + Remult 2 ecosystem tested against it.

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
# better-sqlite3 ist ein native-module — wir kopieren das bereits kompilierte
# node_modules aus dem build-stage statt mit npm ci hier neu zu bauen.
# Spart Compile-Schritt im Runtime-Image, vermeidet Notwendigkeit für
# python3/make/g++ in der Runtime-Schicht.
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/src/fluentreports.d.ts ./src/
COPY --from=build /app/VERSION ./VERSION
COPY --from=build /app/node_modules ./node_modules
# Default-Skills für den KI-Assistenten — werden beim ersten Start ins DATA_DIR
# kopiert. Power-User editieren danach $DATA_DIR/agents/skills/*.md.
COPY --from=build /app/src/server/default-agents ./dist/server/default-agents
EXPOSE 6002
ENV NODE_ENV=production
CMD ["node", "dist/server/index.js"]
