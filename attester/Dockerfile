# Build from the repository root: docker compose -f attester/docker-compose.yml up -d
FROM node:22-slim
WORKDIR /app
COPY donate-app/src/lib.js donate-app/src/config.js donate-app/src/
COPY ui/src/wasm/log.wasm ui/src/wasm/contract.wasm ui/src/wasm/
COPY attester/package.json attester/package-lock.json attester/
RUN cd attester && npm ci --omit=dev
COPY attester/src attester/src
WORKDIR /app/attester
CMD ["node", "src/main.js"]
