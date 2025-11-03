import socket
import time
from datetime import datetime
from src.services.connection_service import ConnectionService
from src.utils.logger import log_message
from .parser import parse_message, HopData

def handle_provider(conn, address, db_client):
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

            handle_data_provider(conn, address, data_byte, db_client)
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

def handle_data_provider(conn, address, initial_bytes_data, db_client):
    client_info = f"{address[0]}:{address[1]}"
    scet = 0
    data_byte = initial_bytes_data

    try:
        conn.settimeout(30.0)
        
        while True:
            time_stamp = datetime.now()
            scet += 1
            
            hex_data = data_byte.hex()
            
            if not hex_data:
                log_message('INFO', f"Provider disconnected properly", client_info)
                break

            # Форматируем HEX для логов
            hex_with_spaces = ' '.join(hex_data[i:i+2] for i in range(0, len(hex_data), 2))
            
            # Логируем только HEX
            log_message('INFO', f"HEX Data: {hex_with_spaces}", client_info)

            # Парсим сообщение для отображения на сайте
            hops, errors = parse_message(data_byte)
            
            # Формируем данные для веб-интерфейса
            parsed_data = {
                'hex_data': hex_with_spaces,
                'hops': [
                    {
                        'module_num': hop.module_num,
                        'lat': hop.lat,
                        'lng': hop.lng, 
                        'altitude': hop.altitude,
                        'speed': hop.speed,
                        'roc': hop.roc
                    } for hop in hops
                ],
                'errors': errors,
                'packet_number': scet,
                'timestamp': time_stamp.isoformat(),
                'provider': client_info
            }
            
            # Сохраняем в историю для веб-интерфейса
            ConnectionService.add_parsed_message(parsed_data)

            # Асинхронная отправка в DB Service
            db_client.send_message({
                'provider_address': client_info,
                'hex_data': hex_data,
                'parsed_data': parsed_data,
                'packet_number': scet,
                'timestamp': time_stamp.isoformat()
            })
            
            ConnectionService.update_module_activity(client_info)
            
            try:
                data_byte = conn.recv(1024)
                if not data_byte:
                    log_message('INFO', f"Provider disconnected", client_info)
                    break

            except socket.timeout:
                log_message('WARNING', f"Provider connection timeout", client_info)
                break
            except (ConnectionResetError, BrokenPipeError, OSError):
                log_message('INFO', f"Provider disconnected", client_info)
                break
                
    except ConnectionResetError:
        log_message('WARNING', f"Provider disconnected abruptly", client_info)
    except Exception as e:
        log_message('ERROR', f"Error with provider: {e}", client_info)        
    finally:
        log_message('INFO', f"Provider disconnected: {client_info}", client_info)
        ConnectionService.remove_provider(client_info)
        ConnectionService.update_module_status(client_info, 'disconnected')
        try:
            conn.close()
        except:
            pass