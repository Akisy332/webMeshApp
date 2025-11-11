#!/usr/bin/env python3
import time
import threading
import signal
import sys

from src.core.server import ProviderServer
from src.api.routes import create_app
from src.utils.logger import setup_logging, log_message
from src.utils.health_check import start_health_check
from config.settings import settings

def shutdown_handler(signum, frame):
    log_message('INFO', f"Shutting down {settings.SERVICE_NAME}...")
    sys.exit(0)

def main():
    setup_logging()
    
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    
    try:
        log_message('INFO', f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}")
        
        # Запуск TCP сервера
        provider_server = ProviderServer()
        provider_thread = threading.Thread(target=provider_server.start)
        provider_thread.daemon = True
        provider_thread.start()

        log_message('INFO', f"Provider server started on port {settings.PROVIDER_PORT}")

        # Health checks
        health_thread = threading.Thread(target=start_health_check)
        health_thread.daemon = True
        health_thread.start()

        time.sleep(2)
        
        # Запуск Flask
        app = create_app()
        log_message('INFO', f"Starting API server on port {settings.API_PORT}")
        app.run(
            host=settings.HOST, 
            port=settings.API_PORT, 
            debug=False, 
            threaded=True
        )

    except KeyboardInterrupt:
        log_message('INFO', "Service shutdown by user")
    except Exception as e:
        log_message('ERROR', f"Service error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()