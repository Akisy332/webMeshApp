from flask import (
    Blueprint,
    request,
    make_response,
    render_template,
)

from app.shared.database.models import DatabaseManager

from flask_jwt_extended import jwt_required
from flask_jwt_extended import get_jwt

client = Blueprint(
    "frontend",
    __name__,
    static_url_path="/static/",
    static_folder="",
    template_folder="",
)

@client.route("/")
def main_page():
    """
    Главная страница сайта
    :return:
    """
    
    response = make_response(render_template("components/main_page/template.html"))
    return response

# @client.route('/table')
# def show_table():
#     return render_template('components/database_viewer/template.html')

@client.route('/initTableMap')
def initTableMap():
    map_config = {
        "lat": 56.4520,
        "lon":  84.9615,
        "zoom": 13
    }
    database = DatabaseManager()
    table = database.get_last_message(1)
    data = {
        "table": table,
        "map": map_config
    }
    return data