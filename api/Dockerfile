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

# Caminho do schema Prisma neste repositório.
ENV PRISMA_SCHEMA_PATH=prisma/schema.prisma

# Gera o Prisma Client com schema explícito.
# Mantém fallback para estruturas antigas por segurança.
RUN if [ -f "$PRISMA_SCHEMA_PATH" ]; then \
      npx prisma generate --schema="$PRISMA_SCHEMA_PATH"; \
    elif [ -f "src/prisma/schema.prisma" ]; then \
      npx prisma generate --schema="src/prisma/schema.prisma"; \
    else \
      echo "Prisma schema não encontrado em src/prisma/schema.prisma nem prisma/schema.prisma" && exit 1; \
    fi

ENV NODE_ENV=production
EXPOSE 4000

# Em produção, rode migrations em release job separado.
# O serviço web deve iniciar sem bloquear healthcheck.
CMD ["npm", "run", "start"]
