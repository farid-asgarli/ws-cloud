# ---- Stage 1: Build the Vite frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app

COPY front/package.json front/package-lock.json* ./
RUN npm ci

COPY front/ ./

# Empty base URLs so the SPA uses same-origin relative requests
ENV VITE_API_BASE_URL=""
ENV VITE_WS_BASE_URL=""
RUN npm run build

# ---- Stage 2: Build the .NET backend ----
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS backend-build
WORKDIR /src

# Copy solution-level files
COPY back/Directory.Build.props ./
COPY back/Directory.Packages.props ./

# Copy project files for restore
COPY back/src/Cloud.File.Server/Cloud.File.Server.csproj src/Cloud.File.Server/
COPY back/src/Cloud.File.Shared/Cloud.File.Shared.csproj src/Cloud.File.Shared/
RUN dotnet restore src/Cloud.File.Server/Cloud.File.Server.csproj

# Copy all source code
COPY back/src/ src/

# Embed the frontend build output into wwwroot
COPY --from=frontend-build /app/dist src/Cloud.File.Server/wwwroot/

RUN dotnet publish src/Cloud.File.Server/Cloud.File.Server.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ---- Stage 3: Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app

RUN mkdir -p /app/storage

COPY --from=backend-build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "Cloud.File.Server.dll"]
