FROM node:22-alpine
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
USER node
EXPOSE 3301
CMD ["node", "dist/index.js"]
