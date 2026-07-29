FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=3000 DB_FILE=/app/data/chakula.db NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--no-warnings=ExperimentalWarning", "server/server.js"]
