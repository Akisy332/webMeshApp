from flask import Flask, jsonify, request, render_template, send_file
import os
from src.services.provider_service import ProviderService
from src.services.connection_service import ConnectionService
from src.utils.logger import get_all_logs, get_log_files_info
from config.settings import settings

def create_app():
    app = Flask(__name__)
    
    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/health')
    def health():
        return jsonify({
            'status': 'healthy',
            'service': settings.SERVICE_NAME,
            'version': settings.SERVICE_VERSION
        })

    @app.route('/api/v1/connected_modules')
    def get_connected_modules():
        modules = ConnectionService.get_connected_modules()
        return jsonify(modules)

    @app.route('/api/v1/send_message', methods=['POST'])
    def send_message():
        data = request.json
        module_address = data.get('address')
        message = data.get('message')
        
        if not message or not module_address:
            return jsonify({'status': 'error', 'message': 'Message and address are required'})
        
        success = ProviderService.send_to_provider(module_address, message)
        if success:
            return jsonify({'status': 'success', 'message': 'Message sent to provider'})
        else:
            return jsonify({'status': 'error', 'message': 'Failed to send message to provider'})

    @app.route('/api/v1/metrics')
    def get_metrics():
        metrics = ProviderService.get_metrics()
        return jsonify(metrics)

    @app.route('/api/v1/logs')
    def get_logs():
        logs = get_all_logs()
        return jsonify(logs)

    @app.route('/api/v1/parsed_data')
    def get_parsed_data():
        """API для получения распаршенных данных из памяти"""
        limit = request.args.get('limit', 100, type=int)
        messages = ConnectionService.get_parsed_messages(limit=limit)
        return jsonify(messages)

    @app.route('/api/v1/parsed_data/clear')
    def clear_parsed_data():
        """Очистка распаршенных данных в памяти"""
        ConnectionService.clear_parsed_messages()
        return jsonify({'status': 'success', 'message': 'Parsed data cleared'})

    @app.route('/api/v1/logs/files')
    def get_log_files():
        files_info = get_log_files_info()
        return jsonify(files_info)

    @app.route('/api/v1/logs/files/<filename>')
    def download_log_file(filename):
        if '..' in filename or filename.startswith('/'):
            return jsonify({'error': 'Invalid filename'}), 400
            
        log_file_path = os.path.join(settings.LOG_DIR, filename)
        
        if not os.path.exists(log_file_path):
            return jsonify({'error': 'File not found'}), 404
            
        return send_file(log_file_path, as_attachment=True)

    @app.route('/api/v1/logs/clear')
    def clear_memory_logs():
        from src.utils.logger import all_messages
        all_messages.clear()
        return jsonify({'status': 'success', 'message': 'Memory logs cleared'})

    return app