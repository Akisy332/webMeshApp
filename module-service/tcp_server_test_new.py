import socket
from datetime import datetime
import threading
from queue import Queue
import uuid
from collections import deque
import select
from flask import Flask, render_template, request, jsonify
import logging
from logging.handlers import RotatingFileHandler
import json
import time
from parser import parse_message, HopData

# Data structures
message_queue = Queue(maxsize=10000)

last_packet_sent = {}  # Dictionary to track last packet sent to each client
MAX_MESSAGES_PER_CLIENT = 10000  # Constant for maximum messages to store per client

# Global lists for web interface
connected_modules = []
all_messages = deque(maxlen=10000)  # Store all messages for web display
sent_messages = deque(maxlen=10000)  # Store messages sent to modules

# Dictionary to track provider connections
provider_connections = {}  # key: address, value: socket connection

# Flask app
app = Flask(__name__)

# Disable Werkzeug logging for REST requests
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler('server.log', maxBytes=10485760, backupCount=10),  # 10MB per file
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def is_connection_alive(conn):
    """Проверяет, активно ли соединение"""
    try:
        # Используем select для проверки соединения без отправки данных
        ready_to_read, ready_to_write, in_error = select.select([], [conn], [conn], 0.1)
        if conn in ready_to_write and conn not in in_error:
            return True
        return False
    except (ConnectionResetError, BrokenPipeError, OSError, ValueError):
        return False
    except Exception as e:
        log_message('DEBUG', f"Connection check error: {e}")
        return False

def log_message(level, message, module_info=None):
    """Универсальная функция логирования"""
    log_entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
        'level': level,
        'message': message,
        'module': module_info
    }
    
    # Логируем в файл
    if level == 'INFO':
        logger.info(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'WARNING':
        logger.warning(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'ERROR':
        logger.error(f"{module_info or 'SYSTEM'} - {message}")
    elif level == 'DEBUG':
        logger.debug(f"{module_info or 'SYSTEM'} - {message}")
    
    # Добавляем для отображения на веб-странице
    all_messages.append(log_entry)

def update_connected_modules():
    """Обновляет список подключенных модулей"""
    global connected_modules
    current_time = time.time()
    
    # Очищаем устаревшие соединения (более 60 секунд без активности)
    connected_modules = [
        module for module in connected_modules 
        if current_time - module.get('last_activity', 0) < 60
    ]

import re
import binascii

def hex_string_to_bytes(hex_string):
    """
    Преобразует строку HEX в байты
    """
    # Удаляем все пробелы и не-hex символы
    cleaned_hex = re.sub(r'[^0-9A-Fa-f]', '', hex_string)
    
    # Проверяем четность длины
    if len(cleaned_hex) % 2 != 0:
        raise ValueError("Некорректная HEX строка: длина должна быть четной")
    
    # Преобразуем HEX в байты
    try:
        binary_data = binascii.unhexlify(cleaned_hex)
        return binary_data
    except binascii.Error as e:
        raise ValueError(f"Некорректная HEX строка: {e}")

def is_valid_hex_string(hex_string):
    """
    Проверяет, является ли строка валидной HEX строкой
    """
    try:
        hex_string_to_bytes(hex_string)
        return True
    except ValueError:
        return False

def process_hex_input(hex_input):
    """
    Основная функция обработки HEX ввода
    """
    try:
        binary_data = hex_string_to_bytes(hex_input)
        return binary_data
    except ValueError as e:
        raise e

def send_to_provider(address, message):
    """Отправляет сообщение поставщику по адресу"""
    try:
        if address in provider_connections:
            conn = provider_connections[address]
            if is_connection_alive(conn):
                
                # Проверяем, является ли сообщение HEX строкой
                if is_valid_hex_string(message):
                    # Преобразуем HEX в бинарные данные для отправки
                    binary_data = hex_string_to_bytes(message)
                    conn.sendall(binary_data)
                    
                    # Логируем отправку в HEX формате
                    hex_representation = binary_data.hex()
                    sent_entry = {
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                        'to_address': address,
                        'message': hex_representation,
                        'direction': 'manual_to_provider',
                        'format': 'hex'
                    }
                else:
                    # Отправляем как обычный текст (для обратной совместимости)
                    conn.sendall((message + "\n").encode())
                    
                    sent_entry = {
                        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                        'to_address': address,
                        'message': message,
                        'direction': 'manual_to_provider',
                        'format': 'text'
                    }
                
                sent_messages.append(sent_entry)
                
                log_message('INFO', f"Message sent to provider: {message}", f"WEB->{address}")
                return True
            else:
                # Удаляем неактивное соединение
                del provider_connections[address]
                log_message('WARNING', f"Provider connection inactive", address)
                return False
        else:
            log_message('WARNING', f"Provider connection not found", address)
            return False
    except Exception as e:
        log_message('ERROR', f"Error sending to provider: {e}", address)
        # Удаляем проблемное соединение
        if address in provider_connections:
            del provider_connections[address]
        return False

def handle_provider(conn, address):
    """Обработчик для поставщиков (порт 5000)"""
    client_info = f"{address[0]}:{address[1]}"
    log_message('INFO', f"New provider connection", client_info)
    
    try:
        # Установка таймаута
        conn.settimeout(30.0)
        
        # Получаем первое сообщение от поставщика
        data_byte = conn.recv(2000)
        if not data_byte:  # Соединение закрыто сразу
            log_message('INFO', f"Provider disconnected immediately", client_info)
            return
        
        if data_byte[0:2] == b'GL':
            log_message('INFO', f"Data provider module connected", client_info)
        
            # Сохраняем соединение с поставщиком
            provider_connections[client_info] = conn
        
            # Добавляем в список подключенных модулей
            module_info = {
                'address': client_info,
                'type': 'provider', 
                'port': 5000,
                'last_activity': time.time(),
                'status': 'connected'
            }
            connected_modules.append(module_info)

            # Обрабатываем данные поставщика
            handle_data_provider(conn, address, data_byte)
        else:
            hex_data = data_byte.hex()
            hex_with_spaces = ' '.join(hex_data[i:i+2] for i in range(0, 20, 2))
            log_message('WARNING', f"Invalid start packet format. Expected '47 4c 20' at start, got: {hex_with_spaces}...", client_info)
            
            with open("invalid_packets.log", "a") as f:
                f.write(f"[{datetime.now()}] Invalid packet: {hex_data}\n")
                
            conn.close()
        
    except Exception as e:
        log_message('ERROR', f"Error initializing provider: {e}", client_info)
        try:
            conn.close()
        except:
            pass

def handle_data_provider(conn, address, initial_bytes_data):
    """Обработчик данных от поставщика"""
    client_info = f"{address[0]}:{address[1]}"
    scet = 0
    data_byte = initial_bytes_data

    try:
        # Установка таймаута
        conn.settimeout(30.0)
        
        while True:
            time_stamp = datetime.now()
            scet += 1
            
            hex_data = data_byte.hex()
            
            if not hex_data:  # Клиент закрыл соединение
                log_message('INFO', f"Provider disconnected properly", client_info)
                break

            hex_with_spaces = ' '.join(hex_data[i:i+2] for i in range(0, len(hex_data), 2))
            log_message('INFO', f"Data: {hex_with_spaces} time = {time_stamp} packet_num = {scet}", client_info)

            with open("raw_data.txt", "a") as f:
                f.write(f"{hex_with_spaces} time = {time_stamp} packet_num = {scet}\n")

            # Парсинг
            hops, errors = parse_message(data_byte)
            
            log_message('INFO',f"Successfully parsed {len(hops)} hops")
            
            for i, hop in enumerate(hops):
                log_message('INFO',f"Hop {i}: module={hop.module_num}, lat={hop.lat:.6f}, lng={hop.lng:.6f}, "
                      f"alt={hop.altitude}, speed={hop.speed}, RoC={hop.roc}")
            
            if errors:
                log_message('INFO',"\nErrors encountered:")
                for error in errors:
                    log_message('INFO',f"  - {error}")

            save_to_queue(hex_data, time_stamp, scet)
            
            # Обновляем время активности
            for module in connected_modules:
                if module.get('address') == client_info and module.get('type') == 'provider':
                    module['last_activity'] = time.time()
                    break
            
            # Get next data packet
            try:
                data_byte = conn.recv(2000)
                if not data_byte:  # Соединение закрыто
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
        
        # Для поставщиков удаляем соединение, но оставляем в списке с статусом disconnected
        if client_info in provider_connections:
            del provider_connections[client_info]
            
        for module in connected_modules:
            if module.get('address') == client_info and module.get('type') == 'provider':
                module['status'] = 'disconnected'
                module['last_activity'] = time.time()
                break
                
        try:
            conn.close()
        except:
            pass

def save_to_queue(message, timestamp, packet_number):
    # Если сообщение пришло в HEX формате, преобразуем его
    if isinstance(message, bytes):
        hex_message = message.hex()
        message_queue.put((packet_number, hex_message, timestamp))
    else:
        # Обычное текстовое сообщение
        message_queue.put((packet_number, message, timestamp))

def provider_server_program():
    """Сервер для поставщиков на порту 5000"""
    host = socket.gethostname()
    port = 5000
    
    # Создаем socket с опцией REUSEADDR
    server_socket = socket.socket()
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server_socket.bind((host, port))
        server_socket.listen()
        log_message('INFO', f"Provider server started on {host}:{port}")
        
        # Список для хранения активных соединений поставщиков
        provider_connections_list = []
        
        try:
            while True:
                conn, address = server_socket.accept()
                # Добавляем соединение в список
                provider_connections_list.append(conn)

                provider_thread = threading.Thread(target=handle_provider, args=(conn, address))
                provider_thread.daemon = True
                provider_thread.start()
                
        except KeyboardInterrupt:
            log_message('INFO', "Provider server shutting down...")
            
        finally:
            # Закрываем все соединения поставщиков
            for conn in provider_connections_list:
                try:
                    conn.close()
                except:
                    pass
                
    finally:
        # Гарантируем закрытие серверного сокета
        server_socket.close()
        log_message('INFO', "Provider server socket closed and port released")

# Flask routes
@app.route('/')
def index():
    """Главная страница веб-интерфейса"""
    update_connected_modules()
    return render_template('index.html')

@app.route('/api/connected_modules')
def get_connected_modules():
    """API для получения списка подключенных модулей"""
    update_connected_modules()
    return jsonify(connected_modules)

@app.route('/api/all_messages')
def get_all_messages():
    """API для получения всех сообщений"""
    return jsonify(list(all_messages))

@app.route('/api/sent_messages')
def get_sent_messages():
    """API для получения отправленных сообщений"""
    return jsonify(list(sent_messages))

@app.route('/api/send_message', methods=['POST'])
def send_message():
    """API для отправки сообщения модулю"""
    data = request.json
    module_address = data.get('address')
    message = data.get('message')
    
    if not message:
        return jsonify({'status': 'error', 'message': 'Message is required'})
    
    # Отправка поставщику (по адресу)
    if module_address:
        success = send_to_provider(module_address, message)
        if success:
            return jsonify({'status': 'success', 'message': 'Message sent to provider'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to send message to provider'})
    
    else:
        return jsonify({'status': 'error', 'message': 'Specify provider address'})

@app.route('/api/server_status')
def get_server_status():
    """API для получения статуса сервера"""
    active_providers = [addr for addr, conn in provider_connections.items() if is_connection_alive(conn)]
    
    # Подсчитываем подключенные модули по типам
    connected_providers = len([m for m in connected_modules if m.get('status') == 'connected' and m.get('type') == 'provider'])
    
    status = {
        'connected_providers': connected_providers,
        'total_modules': connected_providers,
        'active_providers': len(active_providers),
        'total_messages': len(all_messages),
        'sent_messages': len(sent_messages),
        'provider_connections': len(provider_connections),
        'message_queue_size': message_queue.qsize(),
        'server_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
    return jsonify(status)

def start_flask_server():
    """Запуск Flask сервера в отдельном потоке"""
    log_message('INFO', "Starting web server on port 5001")
    app.run(host='0.0.0.0', port=5001, debug=False, threaded=True)

if __name__ == '__main__':
    # Создаем базовый HTML шаблон
    import os
    if not os.path.exists('templates'):
        os.makedirs('templates')
    
    with open('templates/index.html', 'w', encoding='utf-8') as f:
        f.write('''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TCP Server Monitor</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .section { background: white; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
        .stat-card { background: white; padding: 15px; border-radius: 5px; flex: 1; min-width: 200px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; }
        .connected { color: green; }
        .disconnected { color: red; }
        .log-entry { margin-bottom: 5px; padding: 5px; border-left: 3px solid #007bff; }
        .log-warning { border-left-color: #ffc107; }
        .log-error { border-left-color: #dc3545; }
        .log-debug { border-left-color: #6c757d; }
        .message-list { max-height: 400px; overflow-y: auto; }
        .send-form { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .send-form input, .send-form select, .send-form button { padding: 8px; }
        .send-form input { flex: 2; }
        .send-form select { flex: 1; }
        .provider { background-color: #e8f0ff; }
        .active-connection { font-weight: bold; }
        .port-info { font-size: 0.8em; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <h1>TCP Server Monitor</h1>
        
        <div class="stats" id="stats">
            <!-- Stats will be loaded via JavaScript -->
        </div>
        
        <div class="section">
            <h2>Connected Modules</h2>
            <div id="connectedModules">
                <!-- Module list will be loaded via JavaScript -->
            </div>
        </div>
        
        <div class="section">
            <h2>Send Messages to Providers</h2>
            <div class="send-form">
                <input type="text" id="providerMessageInput" placeholder="Enter message for provider...">
                <select id="providerModuleSelect">
                    <option value="">Select provider...</option>
                </select>
                <button onclick="sendToProvider()">Send to Provider</button>
            </div>
            <p><small>Note: sending works only for active connected providers</small></p>
            <div id="sendStatus"></div>
        </div>
        
        <div class="section">
            <h2>Sent Messages</h2>
            <div class="message-list" id="sentMessages">
                <!-- Sent messages list -->
            </div>
        </div>
        
        <div class="section">
            <h2>All Messages (Logs)</h2>
            <div class="message-list" id="allMessages">
                <!-- All messages will be loaded via JavaScript -->
            </div>
        </div>
    </div>

    <script>
        let selectedProvider = '';
        
        function loadStats() {
            fetch('/api/server_status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('stats').innerHTML = `
                        <div class="stat-card">
                            <h3>Connected Providers</h3>
                            <p style="font-size: 24px; color: purple;">${data.connected_providers}</p>
                            <p class="port-info">Port 5000</p>
                        </div>
                        <div class="stat-card">
                            <h3>Total Messages</h3>
                            <p style="font-size: 24px; color: blue;">${data.total_messages}</p>
                        </div>
                        <div class="stat-card">
                            <h3>Sent Messages</h3>
                            <p style="font-size: 24px; color: orange;">${data.sent_messages}</p>
                        </div>
                        <div class="stat-card">
                            <h3>Server Time</h3>
                            <p>${data.server_time}</p>
                            <p class="port-info">Web Port 5001</p>
                        </div>
                    `;
                });
        }
        
        function loadConnectedModules() {
            // Save current selected values
            const providerSelect = document.getElementById('providerModuleSelect');
            selectedProvider = providerSelect.value;
            
            fetch('/api/connected_modules')
                .then(response => response.json())
                .then(modules => {
                    const modulesDiv = document.getElementById('connectedModules');
                    
                    if (modules.length === 0) {
                        modulesDiv.innerHTML = '<p>No connected modules</p>';
                        providerSelect.innerHTML = '<option value="">Select provider...</option>';
                        return;
                    }
                    
                    let html = '<table><tr><th>Type</th><th>Address</th><th>Port</th><th>Status</th><th>Last Activity</th></tr>';
                    let providerOptions = '<option value="">Select provider...</option>';
                    
                    modules.forEach(module => {
                        const statusClass = module.status === 'connected' ? 'connected' : 'disconnected';
                        const lastActivity = new Date(module.last_activity * 1000).toLocaleString();
                        const rowClass = 'provider';
                        const connectionClass = module.status === 'connected' ? 'active-connection' : '';
                        
                        html += `<tr class="${rowClass}">
                            <td>${module.type}</td>
                            <td class="${connectionClass}">${module.address}</td>
                            <td>${module.port}</td>
                            <td class="${statusClass}">${module.status}</td>
                            <td>${lastActivity}</td>
                        </tr>`;
                        
                        if (module.type === 'provider') {
                            const selected = module.address === selectedProvider ? 'selected' : '';
                            providerOptions += `<option value="${module.address}" ${selected}>${module.address} - ${module.status}</option>`;
                        }
                    });
                    
                    html += '</table>';
                    modulesDiv.innerHTML = html;
                    providerSelect.innerHTML = providerOptions;
                });
        }
        
        function loadSentMessages() {
            fetch('/api/sent_messages')
                .then(response => response.json())
                .then(messages => {
                    const sentMessagesDiv = document.getElementById('sentMessages');
                    
                    if (messages.length === 0) {
                        sentMessagesDiv.innerHTML = '<p>No sent messages</p>';
                        return;
                    }
                    
                    let html = '';
                    messages.slice().reverse().forEach(msg => {
                        const direction = msg.direction || 'outgoing';
                        const directionText = direction === 'manual_to_provider' ? 'MANUAL->PROVIDER' : 'AUTOMATIC';
                        
                        html += `<div class="log-entry">
                            <strong>[${msg.timestamp}]</strong> 
                            ${msg.to_address ? `ADDRESS: ${msg.to_address}` : ''}
                            <strong>${msg.message}</strong>
                            <em>(${directionText})</em>
                        </div>`;
                    });
                    
                    sentMessagesDiv.innerHTML = html;
                });
        }
        
        function loadAllMessages() {
            fetch('/api/all_messages')
                .then(response => response.json())
                .then(messages => {
                    const allMessagesDiv = document.getElementById('allMessages');
                    
                    if (messages.length === 0) {
                        allMessagesDiv.innerHTML = '<p>No messages</p>';
                        return;
                    }
                    
                    let html = '';
                    messages.slice().reverse().forEach(msg => {
                        const levelClass = msg.level === 'WARNING' ? 'log-warning' : 
                                         msg.level === 'ERROR' ? 'log-error' : 
                                         msg.level === 'DEBUG' ? 'log-debug' : '';
                        
                        html += `<div class="log-entry ${levelClass}">
                            <strong>[${msg.timestamp}] [${msg.level}]</strong> 
                            ${msg.module ? `Module: ${msg.module} - ` : ''}
                            ${msg.message}
                        </div>`;
                    });
                    
                    allMessagesDiv.innerHTML = html;
                });
        }
        
        function sendToProvider() {
            const message = document.getElementById('providerMessageInput').value;
            const address = document.getElementById('providerModuleSelect').value;
            
            if (!message || !address) {
                document.getElementById('sendStatus').innerHTML = '<p style="color: red;">Fill all fields</p>';
                return;
            }
            
            fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: address, message: message })
            })
            .then(response => response.json())
            .then(result => {
                const statusDiv = document.getElementById('sendStatus');
                if (result.status === 'success') {
                    statusDiv.innerHTML = '<p style="color: green;">Message sent to provider</p>';
                    document.getElementById('providerMessageInput').value = '';
                    loadSentMessages();
                    loadAllMessages();
                } else {
                    statusDiv.innerHTML = `<p style="color: red;">Error: ${result.message}</p>`;
                }
            });
        }
        
        // Auto update every 2 seconds
        function updateAll() {
            loadStats();
            loadConnectedModules();
            loadSentMessages();
            loadAllMessages();
        }
        
        // Initial load
        updateAll();
        
        // Update every 2 seconds
        setInterval(updateAll, 2000);
    </script>
</body>
</html>''')

    # Запускаем серверы в отдельных потоках
    provider_thread = threading.Thread(target=provider_server_program)
    provider_thread.daemon = True
    provider_thread.start()

    # Даем серверам время на запуск
    time.sleep(1)
    
    # Запускаем Flask сервер
    start_flask_server()