from flask import Blueprint, render_template, jsonify, request, redirect, url_for, current_app
from werkzeug.utils import secure_filename
from app.api.database.services import allowed_file
from app.models.database import DatabaseManager
import os

database = Blueprint('database', __name__)

@database.route('/database')
def index():
    return render_template('client/database.html')

@database.route('/api/database/data')
def get_data():
    db_manager = DatabaseManager()
    data = db_manager.get_all_data()
    return jsonify([dict(row) for row in data])

@database.route('/api/database/modules')
def get_modules():
    db_manager = DatabaseManager()
    modules = db_manager.get_all_modules()
    return jsonify([dict(row) for row in modules])

@database.route('/api/database/sessions')
def get_sessions():
    db_manager = DatabaseManager()
    sessions = db_manager.get_all_sessions()
    return jsonify([dict(row) for row in sessions])

@database.route('/api/database/upload', methods=['GET', 'POST'])
def upload_file():
    if request.method == 'POST':
        if 'file' not in request.files:
            return redirect(request.url)
        
        file = request.files['file']
        session_name = request.form.get('session_name', 'default_session')
        
        if file.filename == '':
            return redirect(request.url)
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            
            db_manager = DatabaseManager()
            
            try:
                with open(filepath, 'r') as f:
                    lines = f.readlines()
                    success_count = 0
                    error_count = 0
                    
                    for line in lines:
                        line = line.strip()
                        if line:
                            if db_manager.parse_and_store_data(line, session_name):
                                success_count += 1
                            else:
                                error_count += 1
                
                return f'''
                    <script>
                        alert('Файл успешно обработан! Успешно: {success_count}, Ошибок: {error_count}');
                        window.location.href = '/';
                    </script>
                '''
            except Exception as e:
                return f'''
                    <script>
                        alert('Ошибка при обработке файла: {str(e)}');
                        window.location.href = '/';
                    </script>
                '''
            finally:
                if os.path.exists(filepath):
                    os.remove(filepath)
    
    return redirect(url_for('database.index'))