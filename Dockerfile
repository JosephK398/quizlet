# ─────────────────────────────────────────────────────────────
# QuizBlast — Dockerfile
# Multi-stage: build React client, then serve via Express.
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Build the React client ──────────────────────────
FROM node:20-alpine AS client-builder

WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --silent

COPY client/ ./
RUN npm run build


# ── Stage 2: Production server ────────────────────────────────
FROM node:20-alpine

# Install native build deps required by better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install server dependencies
COPY server/package*.json ./
RUN npm ci --omit=dev --silent

# Copy server source
COPY server/ ./

# Copy built client assets into server's expected location
COPY --from=client-builder /build/client/dist ./client/dist

# Ensure data directory exists for SQLite
RUN mkdir -p ./data

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Run
CMD ["node", "index.js"]
