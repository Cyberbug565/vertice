# Imagen de producción: compila el cliente y sirve juego + API + WebSocket desde un único proceso Node.
FROM node:22.12-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
COPY tools/loadtest/package.json tools/loadtest/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22.12-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 TRUST_PROXY=true
WORKDIR /app
COPY --from=build /app /app
EXPOSE 8080
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "server/src/main.ts"]
