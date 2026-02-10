# Build: instalar dependencias y generar el frontend
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Run: solo dependencias de producción + artefactos de build
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server ./server

EXPOSE 3000
# PORT lo inyecta Railway al ejecutar el contenedor

CMD ["node", "server/index.js"]
