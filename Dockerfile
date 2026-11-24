FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs server.json ./
ENV NODE_ENV=production
ENV PORT=3121
ENV NEUROSETI_API_BASE=https://api.neuroseti.ru/v1
EXPOSE 3121
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3121/health || exit 1
CMD ["node", "server.mjs", "--http"]
