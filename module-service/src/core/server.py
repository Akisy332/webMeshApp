import socket
import threading
from src.core.provider_handler import handle_provider
from src.utils.logger import log_message
from config.settings import settings

class ProviderServer:
    def __init__(self, host=None, port=None):
        self.host = host or settings.HOST
        self.port = port or settings.PROVIDER_PORT
        self.server_socket = None
        self.running = False
        self.provider_connections = []

    def start(self):
        try:
            self.server_socket = socket.socket()
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(1000)  # Большой backlog
            
            self.running = True
            log_message('INFO', f"Provider server started on {self.host}:{self.port}")
            
            while self.running:
                try:
                    conn, address = self.server_socket.accept()
                    self.provider_connections.append(conn)

                    provider_thread = threading.Thread(
                        target=handle_provider, 
                        args=(conn, address)
                    )
                    provider_thread.daemon = True
                    provider_thread.start()
                    
                except Exception as e:
                    if self.running:
                        log_message('ERROR', f"Error accepting connection: {e}")
                    
        except Exception as e:
            log_message('ERROR', f"Server error: {e}")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        for conn in self.provider_connections:
            try:
                conn.close()
            except:
                pass
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass
        log_message('INFO', "Provider server stopped")