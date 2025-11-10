# frontend/run.py
from app import socketio, app
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('frontend-run')

if __name__ == '__main__':
    logger.info("Starting Flask-SocketIO server...")
    
    # Для разработки используем allow_unsafe_werkzeug
    try:
        socketio.run(
            app, 
            host='0.0.0.0', 
            port=5000, 
            allow_unsafe_werkzeug=True,
            debug=False,
            log_output=True
        )
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Server error: {e}")
        raise