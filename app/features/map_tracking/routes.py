from flask import Blueprint, request, jsonify
import json
from app.shared.database.models import DatabaseManager
# from app.models.right import Right
# from app.api.map.services import (
#     validate_request_data,
#     upload_files,
#     get_map_json,
#     get_map_images_list,
#     update_map_item_service,
#     delete_map_image,
# )
# from app.services import response


from flask_jwt_extended import jwt_required, get_jwt

map = Blueprint("map", __name__)

@map.route('/get_trace_module', methods=['GET'])
def get_trace_module():
    id_module = request.args.get('id_module', type=str)
    id_session = request.args.get('id_session', type=int)
    id_message_type = request.args.get('id_message_type', type=int)
    
    db_manager = DatabaseManager()
    data = db_manager.get_module_coordinates(int(id_module, 16), id_session, id_message_type)
   
    return jsonify(data)