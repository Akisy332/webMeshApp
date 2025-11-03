from datetime import datetime
from src.services.connection_service import ConnectionService
from src.core.message_processor import MessageProcessor
from src.utils.hex_utils import hex_string_to_bytes, is_valid_hex_string
from src.utils.logger import log_message

class ProviderService:
    @staticmethod
    def send_to_provider(address, message):
        try:
            conn = ConnectionService.get_provider_connection(address)
            if conn and ConnectionService.is_connection_alive(conn):
                
                if is_valid_hex_string(message):
                    binary_data = hex_string_to_bytes(message)
                    conn.sendall(binary_data)
                    hex_representation = binary_data.hex()
                    sent_entry = {
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                        'to_address': address,
                        'message': hex_representation,
                        'direction': 'manual_to_provider',
                        'format': 'hex'
                    }
                else:
                    conn.sendall((message + "\n").encode())
                    sent_entry = {
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                        'to_address': address,
                        'message': message,
                        'direction': 'manual_to_provider',
                        'format': 'text'
                    }
                
                MessageProcessor.add_sent_message(sent_entry)
                log_message('INFO', f"Message sent to provider: {message}", f"API->{address}")
                return True
            else:
                ConnectionService.remove_provider(address)
                log_message('WARNING', f"Provider connection inactive", address)
                return False
                
        except Exception as e:
            log_message('ERROR', f"Error sending to provider: {e}", address)
            ConnectionService.remove_provider(address)
            return False

    @staticmethod
    def get_metrics():
        modules = ConnectionService.get_connected_modules()
        connected_providers = len([
            m for m in modules 
            if m.get('status') == 'connected' and m.get('type') == 'provider'
        ])
        
        return {
            'connected_providers': connected_providers,
            'total_modules': len(modules),
            'active_connections': ConnectionService.get_provider_connections_count(),
            'sent_messages_count': MessageProcessor.get_sent_messages_count()
        }