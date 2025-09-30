from app.core.socketio import socketio
# from shared.database.models import Message

# @socketio.on('send_message')
# def handle_message(data):
#     """Обработка чат-сообщения"""
#     try:
#         # Валидация
#         if not data.get('text'):
#             raise ValueError("Empty message")
        
#         # Работа с моделью
#         message = Message.create(
#             text=data['text'],
#             user_id=data['user_id']
#         )
        
#         # Отправка ответа
#         socketio.emit('new_message', message.to_dict())
        
#     except Exception as e:
#         socketio.emit('error', {'message': str(e)})