# Serveur Vocourse — image de production (Node 24 LTS, aucune dépendance npm à l'exécution).
# Construction depuis la racine du dépôt :  docker build -f server/Dockerfile -t vocourse-server .
FROM node:24-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/vocourse.sqlite

WORKDIR /app
COPY shared ./shared
COPY server/package.json ./server/package.json
COPY server/src ./server/src

RUN mkdir -p /data && chown -R node:node /data
USER node
WORKDIR /app/server
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/main.ts"]
