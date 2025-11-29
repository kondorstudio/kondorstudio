# Imagem base do Node
FROM node:18-alpine

# Diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Copiar os arquivos de dependência
COPY package*.json ./

# Instalar dependências (sem devDependencies para produção)
RUN npm install --omit=dev

# Copiar o restante do código da API
COPY . .

# Expor a porta usada pelo servidor Express
EXPOSE 4000

# Comando para iniciar a API
CMD ["npm", "start"]
