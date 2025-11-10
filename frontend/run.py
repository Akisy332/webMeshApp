from app import socketio, app

if __name__ == '__main__':
    print("Starting Flask-SocketIO server...")
    # Для разработки используем allow_unsafe_werkzeug
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)