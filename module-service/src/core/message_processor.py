from collections import deque
from src.utils.logger import log_message

class MessageProcessor:
    sent_messages = deque(maxlen=10000)
    
    @staticmethod
    def add_sent_message(entry):
        MessageProcessor.sent_messages.append(entry)
        log_message('DEBUG', f"Sent message recorded: {entry.get('to_address')}")

    @staticmethod
    def get_sent_messages():
        return list(MessageProcessor.sent_messages)

    @staticmethod
    def get_sent_messages_count():
        return len(MessageProcessor.sent_messages)