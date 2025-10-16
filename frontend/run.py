from app import socketio, app 

if __name__ == '__main__':
    print("Starting Flask-SocketIO server...")
    socketio.run(app, host='0.0.0.0', port=5000)