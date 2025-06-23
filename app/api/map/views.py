from flask import Blueprint, request
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
