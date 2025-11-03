import re
import binascii

def hex_string_to_bytes(hex_string):
    cleaned_hex = re.sub(r'[^0-9A-Fa-f]', '', hex_string)
    
    if len(cleaned_hex) % 2 != 0:
        raise ValueError("Некорректная HEX строка: длина должна быть четной")
    
    try:
        binary_data = binascii.unhexlify(cleaned_hex)
        return binary_data
    except binascii.Error as e:
        raise ValueError(f"Некорректная HEX строка: {e}")

def is_valid_hex_string(hex_string):
    try:
        hex_string_to_bytes(hex_string)
        return True
    except ValueError:
        return False