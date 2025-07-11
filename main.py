from app import app
from app.core.socketio import socketio


# from flask_script import Manager

# Run the manager
if __name__ == "__main__":
    socketio.run(app, debug=True)
