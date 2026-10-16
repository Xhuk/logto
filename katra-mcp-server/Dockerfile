# Generated for katra-logto-admin (TypeScript / mcp-use).
# CONTRACT C-17, C-18: no embedded secrets; every credential is read from the environment
# at runtime, so the same image works for any deployment.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8000

CMD ["npm", "run", "start"]
