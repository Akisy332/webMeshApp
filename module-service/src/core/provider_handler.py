import socket
import time
from datetime import datetime
from src.services.connection_service import ConnectionService
from src.utils.logger import log_message
from .parser import parse_message, HopData

import json
from shared.redis_client import get_redis_client

def handle_provider(conn, address):
    client_info = f"{address[0]}:{address[1]}"
    log_message('INFO', f"New provider connection", client_info)
    
    try:
        conn.settimeout(30.0)
        
        data_byte = conn.recv(1024)
        if not data_byte:
            log_message('INFO', f"Provider disconnected immediately", client_info)
            return
        
        if data_byte[0:2] == b'GL':
            log_message('INFO', f"Data provider module connected", client_info)
        
            ConnectionService.add_provider(client_info, conn)
            ConnectionService.add_connected_module({
                'address': client_info,
                'type': 'provider', 
                'port': 5000,
                'last_activity': time.time(),
                'status': 'connected'
            })

            handle_data_provider(conn, address, data_byte)
        else:
            hex_data = data_byte.hex()
            log_message('WARNING', f"Invalid start packet format", client_info)
            conn.close()
        
    except Exception as e:
        log_message('ERROR', f"Error initializing provider: {e}", client_info)
        try:
            conn.close()
        except:
            pass

def handle_data_provider(conn, address, initial_bytes_data):
    client_info = f"{address[0]}:{address[1]}"
    scet = 0
    data_byte = initial_bytes_data
    redis_client = get_redis_client()

    try:
        conn.settimeout(30.0)
        
        while True:
            time_stamp = datetime.now()
            scet += 1
            
            hex_data = data_byte.hex()
            
            if not hex_data:
                log_message("INFO", f"Provider disconnected properly", client_info)
                break

            hex_with_spaces = ' '.join(hex_data[i:i+2] for i in range(0, len(hex_data), 2))
            log_message("INFO", f"HEX Data: {hex_with_spaces}", client_info)

            # Парсинг сообщения
            packets, errors = parse_message(data_byte)
            
            # Формируем данные для веб-интерфейса
            parsed_data = {
                'hex_data': hex_with_spaces,
                'packets': [
                    {
                        'module_num': subpacket.module_num,
                        'packet_type': subpacket.packet_type,
                        'lat': subpacket.lat,
                        'lng': subpacket.lng, 
                        'altitude': subpacket.altitude,
                        'speed': subpacket.speed,
                        'roc': subpacket.roc,
                        'hop': subpacket.hop
                    } for subpacket in packets
                ],
                'errors': errors,
                'packet_number': scet,
                'timestamp': time_stamp.isoformat(),
                'provider': client_info
            }
            
            # Сохраняем в историю для веб-интерфейса
            ConnectionService.add_parsed_message(parsed_data)
            
            if not errors:
                # ВАЛИДНЫЕ данные - отправляем только распарсенные значения
                redis_message = {
                    'type': 'valid_module_data',
                    'data': {
                        'packets': [
                            {
                                'module_num': subpacket.module_num,
                                'lat': subpacket.lat,
                                'lng': subpacket.lng, 
                                'altitude': subpacket.altitude,
                                'speed': subpacket.speed,
                                'roc': subpacket.roc
                            } for subpacket in packets
                        ],
                        'packet_number': scet
                    },
                    'provider': client_info,
                    'timestamp': time_stamp.isoformat()
                }
                redis_client.publish('module_data', redis_message)
            else:
                # НЕВАЛИДНЫЕ данные - отправляем с причиной ошибки и сырыми данными
                corrupted_message = {
                    'type': 'corrupted_module_data',
                    'data': {
                        'raw_hex': hex_data,  # Сохраняем сырые данные для анализа
                        'parsed_attempt': {
                            'packets': [
                                {
                                    'module_num': subpacket.module_num,
                                    'lat': subpacket.lat,
                                    'lng': subpacket.lng, 
                                    'altitude': subpacket.altitude,
                                    'speed': subpacket.speed,
                                    'roc': subpacket.roc
                                } for subpacket in packets
                            ] if packets else []
                        },
                        'errors': errors,  # Детальная причина ошибки
                        'packet_number': scet
                    },
                    'error_reason': errors[0] if errors else 'Unknown parsing error',
                    'provider': client_info,
                    'timestamp': time_stamp.isoformat()
                }
                redis_client.publish('corrupted_data', corrupted_message)
            
            ConnectionService.update_module_activity(client_info)
            
            try:
                data_byte = conn.recv(1024)
                if not data_byte:
                    log_message("INFO", f"Provider disconnected", client_info)
                    break

            except socket.timeout:
                log_message("WARNING", f"Provider connection timeout", client_info)
                break
            except (ConnectionResetError, BrokenPipeError, OSError):
                log_message("INFO", f"Provider disconnected", client_info)
                break
                
    except Exception as e:
        # КРИТИЧЕСКИЕ ошибки (сбой парсера)
        critical_error_message = {
            'type': 'critical_corrupted_data',
            'data': {
                'raw_hex': data_byte.hex() if data_byte else '',
                'errors': [f'Parser crash: {str(e)}'],
                'timestamp': datetime.now().isoformat(),
                'provider': client_info
            },
            'error_reason': 'parser_crash',
            'provider': client_info,
            'timestamp': datetime.now().isoformat()
        }
        redis_client.publish('corrupted_data', critical_error_message)
        log_message("ERROR", f"Critical parser error: {e}", client_info)
    finally:
        log_message("INFO", f"Provider disconnected: {client_info}", client_info)
        ConnectionService.remove_provider(client_info)
        ConnectionService.update_module_status(client_info, 'disconnected')
        try:
            conn.close()
        except:
            pass