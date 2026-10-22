FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./server.mjs
COPY context.json ./context.json
ENV NODE_ENV=production
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node","server.mjs"]
