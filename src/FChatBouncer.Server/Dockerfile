# Use the official .NET 9.0 runtime image
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
ARG TARGETARCH
WORKDIR /app
EXPOSE 8080

# Use the SDK image to build the application
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:9.0 AS build
ARG TARGETARCH
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["FChatBouncer.Server.csproj", "./"]
RUN dotnet restore "FChatBouncer.Server.csproj" -a $TARGETARCH

# Copy the rest of the application
COPY . .

# Build the application
RUN dotnet build "FChatBouncer.Server.csproj" -c Release -o /app/build -a $TARGETARCH

# Publish the application
FROM build AS publish
RUN dotnet publish "FChatBouncer.Server.csproj" -c Release -o /app/publish /p:UseAppHost=false -a $TARGETARCH

# Final stage
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Create a non-root user for security
RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

ENTRYPOINT ["dotnet", "FChatBouncer.Server.dll"]
