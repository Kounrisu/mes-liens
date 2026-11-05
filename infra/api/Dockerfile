# Image minimale : seulement le JRE et le .jar construit sur le PC (le VPS n'a pas la mémoire pour compiler Maven).
FROM eclipse-temurin:25-jre-alpine

RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /data/screenshots && chown -R app:app /data
USER app
WORKDIR /app
COPY mes-liens-api.jar app.jar

EXPOSE 8080
# 401 (jeton absent) prouve que l'application répond ; seul un échec de connexion est un échec.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -S -O /dev/null http://127.0.0.1:8080/api/sync 2>&1 | grep -q 'HTTP/' || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
