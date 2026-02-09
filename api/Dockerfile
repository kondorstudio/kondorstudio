FROM node:18-slim

WORKDIR /usr/src/app

# Prisma precisa de OpenSSL no runtime/build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copia todo o projeto da API para garantir acesso ao schema e código.
COPY . .

# Evita falha do postinstall quando o schema não está no caminho padrão.
RUN npm install --omit=dev --ignore-scripts

# Caminho preferencial informado para o schema Prisma.
ENV PRISMA_SCHEMA_PATH=src/prisma/schema.prisma

# Gera o Prisma Client com schema explícito.
# Fallback para projetos que ainda usam prisma/schema.prisma.
RUN if [ -f "$PRISMA_SCHEMA_PATH" ]; then \
      npx prisma generate --schema="$PRISMA_SCHEMA_PATH"; \
    elif [ -f "prisma/schema.prisma" ]; then \
      npx prisma generate --schema="prisma/schema.prisma"; \
    else \
      echo "Prisma schema não encontrado em src/prisma/schema.prisma nem prisma/schema.prisma" && exit 1; \
    fi

ENV NODE_ENV=production
EXPOSE 4000

CMD ["npm", "start"]
