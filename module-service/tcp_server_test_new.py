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

# Data structures
message_queue = Queue(maxsize=10000)
client_queues = {}  # Dictionary to store individual deques for each UUID
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

def send_to_provider(address, message):
    """Отправляет сообщение поставщику по адресу"""
    try:
        if address in provider_connections:
            conn = provider_connections[address]
            if is_connection_alive(conn):
                conn.sendall((message + "\n").encode())
                
                # Логируем отправку
                sent_entry = {
                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                    'to_address': address,
                    'message': message,
                    'direction': 'manual_to_provider'
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

def handle_client(conn, address):
    client_info = f"{address[0]}:{address[1]}"
    log_message('INFO', f"New connection", client_info)
    
    client_uuid = None
    module_type = None
    
    try:
        # Установка таймаута (30 секунд)
        conn.settimeout(30.0)
        
        # Step 1: Receive UUID from client
        data = conn.recv(1024).decode().strip()
        if not data:  # Соединение закрыто сразу
            log_message('INFO', f"Client disconnected before sending UUID", client_info)
            return
            
        log_message('DEBUG', f"Received data: {data}", client_info)
        
        if data.startswith("UUID:"):
            # This is a data consumer sending UUID
            module_type = "consumer"
            client_uuid = data[5:]  # Extract UUID part
            
            # Validate UUID
            try:
                uuid_obj = uuid.UUID(client_uuid)
                log_message('DEBUG', f"Valid UUID: {uuid_obj}", client_info)
            except ValueError:
                try:
                    conn.sendall(b"INVALID_UUID\n")
                except:
                    pass
                log_message('WARNING', f"Invalid UUID: {client_uuid}", client_info)
                return
                
            # Send acceptance
            try:
                conn.sendall(b"UUID_ACCEPTED\n")
            except (ConnectionResetError, BrokenPipeError):
                log_message('INFO', f"Client disconnected during UUID confirmation", client_info)
                return
            
            # Initialize client queue if not exists
            if client_uuid not in client_queues:
                client_queues[client_uuid] = deque(maxlen=MAX_MESSAGES_PER_CLIENT)
                last_packet_sent[client_uuid] = 0
            
            # Добавляем в список подключенных модулей
            module_info = {
                'uuid': client_uuid,
                'address': client_info,
                'type': 'consumer',
                'last_activity': time.time(),
                'status': 'connected'
            }
            connected_modules.append(module_info)
            
            log_message('INFO', f"Consumer module connected: {client_uuid}", client_info)
            
            # Step 2: Handle GET requests
            while True:
                try:
                    data = conn.recv(1024).decode().strip()
                    if not data:  # Клиент закрыл соединение
                        log_message('INFO', f"Client disconnected", f"{client_info} ({client_uuid})")
                        break
                        
                    if data == "GET_DATA":
                        response = get_new_data_for_client(client_uuid)
                        try:
                            response = response.strip() + "\n"
                            conn.sendall(response.encode())
                            
                            # Логируем отправленные сообщения
                            if response.strip() != "NO_DATA":
                                sent_entry = {
                                    'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
                                    'to_uuid': client_uuid,
                                    'to_address': client_info,
                                    'message': response.strip(),
                                    'direction': 'outgoing'
                                }
                                sent_messages.append(sent_entry)
                                log_message('DEBUG', f"Data sent: {response.strip()}", f"{client_info} ({client_uuid})")
                                
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            log_message('INFO', f"Client disconnected during send", f"{client_info} ({client_uuid})")
                            break
                            
                        # Обновляем время активности
                        for module in connected_modules:
                            if module.get('uuid') == client_uuid:
                                module['last_activity'] = time.time()
                                break
                                
                    else:
                        try:
                            conn.sendall(b"UNKNOWN_COMMAND\n")
                        except (ConnectionResetError, BrokenPipeError, OSError):
                            log_message('INFO', f"Client disconnected during send", f"{client_info} ({client_uuid})")
                            break
                            
                except socket.timeout:
                    # Таймаут - это нормально, продолжаем ждать данные
                    # Обновляем время активности
                    for module in connected_modules:
                        if module.get('uuid') == client_uuid:
                            module['last_activity'] = time.time()
                            break
                    continue
                except (ConnectionResetError, BrokenPipeError, OSError):
                    log_message('INFO', f"Connection closed by client", f"{client_info} ({client_uuid})")
                    break
                except Exception as e:
                    log_message('ERROR', f"Error processing request: {e}", f"{client_info} ({client_uuid})")
                    break
                    
        elif data.startswith(("GL", "GV")):
            # This is a data provider
            module_type = "provider"
            log_message('INFO', f"Data provider module connected", client_info)
            
            # Сохраняем соединение с поставщиком
            provider_connections[client_info] = conn
            
            # Добавляем в список подключенных модулей
            module_info = {
                'address': client_info,
                'type': 'provider', 
                'last_activity': time.time(),
                'status': 'connected'
            }
            connected_modules.append(module_info)
            
            handle_data_provider(conn, address, data)
        else:
            try:
                conn.sendall(b"INVALID_INITIAL_MESSAGE\n")
                log_message('WARNING', f"Invalid initial message: {data}", client_info)
            except (ConnectionResetError, BrokenPipeError):
                log_message('INFO', f"Client disconnected during send", client_info)
    
    except ConnectionResetError:
        log_message('WARNING', f"Client disconnected abruptly", client_info)
    except socket.timeout:
        log_message('WARNING', f"Timeout waiting for client data", client_info)
    except Exception as e:
        log_message('ERROR', f"Error with client: {e}", client_info)  
    finally:
        log_message('INFO', f"Disconnected: {client_info}", client_info)
        
        # Удаляем из списка подключенных модулей и соединений
        if module_type == "consumer" and client_uuid:
            # Для потребителей только меняем статус, не удаляем полностью
            for module in connected_modules:
                if module.get('uuid') == client_uuid:
                    module['status'] = 'disconnected'
                    module['last_activity'] = time.time()
                    break
        elif module_type == "provider":
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

def handle_data_provider(conn, address, initial_data):
    client_info = f"{address[0]}:{address[1]}"
    scet = 0
    data = initial_data
    
    try:
        # Установка таймаута
        conn.settimeout(30.0)
        
        while True:
            time_stamp = datetime.now()
            scet += 1
            
            if not data:  # Клиент закрыл соединение
                log_message('INFO', f"Module disconnected properly", client_info)
                break
                
            log_message('INFO', f"Data: {data} time = {time_stamp} packet_num = {scet}", client_info)

            with open("raw_data.txt", "a") as f:
                f.write(f"{data} time = {time_stamp} packet_num = {scet}\n")

            save_to_queue(data, time_stamp, scet)
            
            # Обновляем время активности
            for module in connected_modules:
                if module.get('address') == client_info and module.get('type') == 'provider':
                    module['last_activity'] = time.time()
                    break
            
            # Get next data packet
            try:
                data = conn.recv(1024).decode()
            except socket.timeout:
                log_message('WARNING', f"Module connection timeout", client_info)
                break
            except (ConnectionResetError, BrokenPipeError, OSError):
                log_message('INFO', f"Module disconnected", client_info)
                break
                
    except ConnectionResetError:
        log_message('WARNING', f"Module disconnected abruptly", client_info)
    except Exception as e:
        log_message('ERROR', f"Error with module: {e}", client_info)        
    finally:
        log_message('INFO', f"Disconnected module: {client_info}", client_info)
        try:
            conn.close()
        except:
            pass

def save_to_queue(message, timestamp, packet_number):
    message_queue.put((packet_number, message, timestamp))
    
    # Update all client queues with this new message
    for client_uuid in client_queues:
        client_queues[client_uuid].append((packet_number, message, timestamp))
        last_packet_sent[client_uuid] = packet_number

def get_new_data_for_client(client_uuid):
    messages = []
    
    while client_queues[client_uuid]:
        packet_number, message, _ = client_queues[client_uuid].popleft()
        messages.append(f"{message} {packet_number}")  # Формат: "GL123 1.5 42 1"
    
    # Всегда добавляем \n в конце, даже если сообщение одно
    return "\n".join(messages) + "\n" if messages else "NO_DATA\n"

def server_program():
    # host = socket.gethostname()
    host = "192.168.0.106"
    port = 5010
    
    # Создаем socket с опцией REUSEADDR
    server_socket = socket.socket()
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server_socket.bind((host, port))
        server_socket.listen()
        log_message('INFO', f"Server started on {host}:{port}")
        
        # Список для хранения активных клиентских соединений
        client_connections = []
        
        try:
            while True:
                conn, address = server_socket.accept()
                # Добавляем соединение в список
                client_connections.append(conn)

                client_thread = threading.Thread(target=handle_client, args=(conn, address))
                client_thread.daemon = True
                client_thread.start()
                
        except KeyboardInterrupt:
            log_message('INFO', "Server shutting down...")
            
        finally:
            # Закрываем все клиентские соединения
            for conn in client_connections:
                try:
                    conn.close()
                except:
                    pass
                
    finally:
        # Гарантируем закрытие серверного сокета
        server_socket.close()
        log_message('INFO', "Server socket closed and port released")

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
    module_uuid = data.get('uuid')
    module_address = data.get('address')
    message = data.get('message')
    
    if not message:
        return jsonify({'status': 'error', 'message': 'Message is required'})
    
    # Отправка потребителю (по UUID)
    if module_uuid and not module_address:
        if module_uuid not in client_queues:
            return jsonify({'status': 'error', 'message': 'Consumer module not found'})
        
        # Добавляем сообщение в очередь для указанного модуля
        timestamp = datetime.now()
        packet_number = last_packet_sent.get(module_uuid, 0) + 1
        
        client_queues[module_uuid].append((packet_number, message, timestamp))
        last_packet_sent[module_uuid] = packet_number
        
        # Логируем отправку
        sent_entry = {
            'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3],
            'to_uuid': module_uuid,
            'to_address': next((m.get('address') for m in connected_modules if m.get('uuid') == module_uuid), 'unknown'),
            'message': message,
            'direction': 'manual_to_consumer'
        }
        sent_messages.append(sent_entry)
        
        log_message('INFO', f"Manual message sent to consumer: {message}", f"WEB->{module_uuid}")
        
        return jsonify({'status': 'success', 'message': 'Message sent to consumer'})
    
    # Отправка поставщику (по адресу)
    elif module_address and not module_uuid:
        success = send_to_provider(module_address, message)
        if success:
            return jsonify({'status': 'success', 'message': 'Message sent to provider'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to send message to provider'})
    
    else:
        return jsonify({'status': 'error', 'message': 'Specify either consumer UUID or provider address'})

@app.route('/api/server_status')
def get_server_status():
    """API для получения статуса сервера"""
    active_providers = [addr for addr, conn in provider_connections.items() if is_connection_alive(conn)]
    status = {
        'connected_modules': len([m for m in connected_modules if m.get('status') == 'connected']),
        'active_providers': len(active_providers),
        'total_messages': len(all_messages),
        'sent_messages': len(sent_messages),
        'client_queues_size': len(client_queues),
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
        .tab-buttons { display: flex; margin-bottom: 10px; }
        .tab-button { padding: 10px 20px; background: #f8f9fa; border: 1px solid #ddd; cursor: pointer; }
        .tab-button.active { background: #007bff; color: white; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .consumer { background-color: #e8f5e8; }
        .provider { background-color: #e8f0ff; }
        .active-connection { font-weight: bold; }
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
            <h2>Send Messages</h2>
            <div class="tab-buttons">
                <button class="tab-button active" onclick="showTab('consumerTab')">To Consumers</button>
                <button class="tab-button" onclick="showTab('providerTab')">To Providers</button>
            </div>
            
            <div id="consumerTab" class="tab-content active">
                <div class="send-form">
                    <input type="text" id="consumerMessageInput" placeholder="Enter message for consumer...">
                    <select id="consumerModuleSelect">
                        <option value="">Select consumer...</option>
                    </select>
                    <button onclick="sendToConsumer()">Send to Consumer</button>
                </div>
            </div>
            
            <div id="providerTab" class="tab-content">
                <div class="send-form">
                    <input type="text" id="providerMessageInput" placeholder="Enter message for provider...">
                    <select id="providerModuleSelect">
                        <option value="">Select provider...</option>
                    </select>
                    <button onclick="sendToProvider()">Send to Provider</button>
                </div>
                <p><small>Note: sending works only for active connected providers</small></p>
            </div>
            
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
        let currentTab = 'consumerTab';
        let selectedConsumer = '';
        let selectedProvider = '';
        
        function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelectorAll('.tab-button').forEach(button => {
                button.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
            currentTab = tabName;
        }
        
        function loadStats() {
            fetch('/api/server_status')
                .then(response => response.json())
                .then(data => {
                    document.getElementById('stats').innerHTML = `
                        <div class="stat-card">
                            <h3>Connected Modules</h3>
                            <p style="font-size: 24px; color: green;">${data.connected_modules}</p>
                        </div>
                        <div class="stat-card">
                            <h3>Active Providers</h3>
                            <p style="font-size: 24px; color: purple;">${data.active_providers}</p>
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
                        </div>
                    `;
                });
        }
        
        function loadConnectedModules() {
            // Save current selected values
            const consumerSelect = document.getElementById('consumerModuleSelect');
            const providerSelect = document.getElementById('providerModuleSelect');
            selectedConsumer = consumerSelect.value;
            selectedProvider = providerSelect.value;
            
            fetch('/api/connected_modules')
                .then(response => response.json())
                .then(modules => {
                    const modulesDiv = document.getElementById('connectedModules');
                    
                    if (modules.length === 0) {
                        modulesDiv.innerHTML = '<p>No connected modules</p>';
                        consumerSelect.innerHTML = '<option value="">Select consumer...</option>';
                        providerSelect.innerHTML = '<option value="">Select provider...</option>';
                        return;
                    }
                    
                    let html = '<table><tr><th>Type</th><th>UUID</th><th>Address</th><th>Status</th><th>Last Activity</th></tr>';
                    let consumerOptions = '<option value="">Select consumer...</option>';
                    let providerOptions = '<option value="">Select provider...</option>';
                    
                    modules.forEach(module => {
                        const statusClass = module.status === 'connected' ? 'connected' : 'disconnected';
                        const lastActivity = new Date(module.last_activity * 1000).toLocaleString();
                        const rowClass = module.type === 'consumer' ? 'consumer' : 'provider';
                        const connectionClass = module.status === 'connected' ? 'active-connection' : '';
                        
                        html += `<tr class="${rowClass}">
                            <td>${module.type}</td>
                            <td class="${connectionClass}">${module.uuid || 'N/A'}</td>
                            <td class="${connectionClass}">${module.address}</td>
                            <td class="${statusClass}">${module.status}</td>
                            <td>${lastActivity}</td>
                        </tr>`;
                        
                        if (module.type === 'consumer' && module.uuid) {
                            const selected = module.uuid === selectedConsumer ? 'selected' : '';
                            consumerOptions += `<option value="${module.uuid}" ${selected}>${module.uuid} (${module.address}) - ${module.status}</option>`;
                        } else if (module.type === 'provider') {
                            const selected = module.address === selectedProvider ? 'selected' : '';
                            providerOptions += `<option value="${module.address}" ${selected}>${module.address} - ${module.status}</option>`;
                        }
                    });
                    
                    html += '</table>';
                    modulesDiv.innerHTML = html;
                    consumerSelect.innerHTML = consumerOptions;
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
                        const directionText = direction === 'manual_to_provider' ? 'MANUAL->PROVIDER' : 
                                            direction === 'manual_to_consumer' ? 'MANUAL->CONSUMER' : 
                                            direction === 'manual' ? 'MANUAL' : 'AUTOMATIC';
                        
                        html += `<div class="log-entry">
                            <strong>[${msg.timestamp}]</strong> 
                            ${msg.to_uuid ? `UUID: ${msg.to_uuid}` : ''}
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
        
        function sendToConsumer() {
            const message = document.getElementById('consumerMessageInput').value;
            const uuid = document.getElementById('consumerModuleSelect').value;
            
            if (!message || !uuid) {
                document.getElementById('sendStatus').innerHTML = '<p style="color: red;">Fill all fields</p>';
                return;
            }
            
            fetch('/api/send_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uuid: uuid, message: message })
            })
            .then(response => response.json())
            .then(result => {
                const statusDiv = document.getElementById('sendStatus');
                if (result.status === 'success') {
                    statusDiv.innerHTML = '<p style="color: green;">Message sent to consumer</p>';
                    document.getElementById('consumerMessageInput').value = '';
                    loadSentMessages();
                    loadAllMessages();
                } else {
                    statusDiv.innerHTML = `<p style="color: red;">Error: ${result.message}</p>`;
                }
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

    # Запускаем TCP сервер и Flask в отдельных потоках
    tcp_thread = threading.Thread(target=server_program)
    tcp_thread.daemon = True
    tcp_thread.start()

    # Даем TCP серверу время на запуск
    time.sleep(1)
    
    # Запускаем Flask сервер
    start_flask_server()