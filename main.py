from app import app
from app.core.socketio import socketio

# from flask_script import Manager

# Run the manager
if __name__ == "__main__":
    port = 8080
    # host = 
    socketio.run(app, port=port, debug=False)