FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=12000 \
    TEMP_DIR=/tmp/flacplay
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
RUN chown -R node:node /app && mkdir -p /tmp/flacplay && chown -R node:node /tmp/flacplay
USER node
EXPOSE 12000
CMD ["node", "server/index.mjs"]
