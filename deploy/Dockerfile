# Image unique EduPilote v2 : API + worker (Go) et application React compilée.
# Construire depuis la racine du dépôt :  docker build -f deploy/Dockerfile -t edupilot .

FROM node:22-alpine AS front
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM golang:1.26-alpine AS back
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/edupilot ./cmd/server \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/cardsim ./cmd/cardsim

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 edupilot
COPY --from=back /out/ /usr/local/bin/
COPY --from=front /src/dist /srv/www
ENV EDUPILOT_ADDR=:8080 EDUPILOT_STATIC_DIR=/srv/www EDUPILOT_TZ=Africa/Dakar
USER edupilot
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/readyz || exit 1
ENTRYPOINT ["edupilot"]
