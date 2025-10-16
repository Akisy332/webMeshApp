FROM postgres:15

# Копируем скрипты инициализации
COPY init-scripts/ /docker-entrypoint-initdb.d/

# Настройки для производительности
RUN chmod +x /docker-entrypoint-initdb.d/*.sh

EXPOSE 5432