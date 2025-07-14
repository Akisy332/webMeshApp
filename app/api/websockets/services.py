from app.core.socketio import socketio
from app.models.database import DatabaseManager

def send_new_module_data(data):
    try:
        socketio.emit('moduleUpdate', data)
    except Exception as e:
        socketio.emit('error', {'message': str(e)})

@socketio.on('addRandomPoint')
def add_random_point():
    try:        
        db_manager = DatabaseManager()
        result = db_manager.add_random_ffff_module_data()
        if(result):
            send_new_module_data(result)
        
    except Exception as e:
        socketio.emit('error', {'message': str(e)})