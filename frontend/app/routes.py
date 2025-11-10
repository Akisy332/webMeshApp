from flask import render_template, jsonify
from . import app, socketio

# ==================== STATIC PAGES ====================

@app.route('/')
def main_page():
    """Главная страница сайта"""
    return render_template("main_page/template.html")

@app.route('/table')
def table_page():
    """Страница с таблицей телеметрии"""
    return render_template('telemetry_data_table/template.html')

@app.route('/database')
def database_page():
    """Страница просмотра базы данных"""
    return render_template('database_viewer/template.html')

# ==================== HEALTH ENDPOINT ====================

@app.route('/health-check')
def health_check():
    return jsonify({'status': 'OK', 'service': 'frontend-static'})