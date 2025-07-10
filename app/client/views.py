from flask import (
    Blueprint,
    request,
    make_response,
    render_template,
)

# from app.models.right import Right

from app.models.database import DatabaseManager

from flask_jwt_extended import jwt_required
from flask_jwt_extended import get_jwt

client = Blueprint(
    "client",
    __name__,
    static_url_path="/client/static/",
    static_folder="static",
    template_folder="templates",
)


@client.route("/")
def main_page():
    """
    Главная страница сайта
    :return:
    """
    map_config = {
        "lat": 56.4520,
        "lon":  84.9615,
        "zoom": 13
    }
    
    database = DatabaseManager()
    last_messages = database.get_last_message(1)
    
    response = make_response(render_template("client/index.html", 
                                             initial_map_config=map_config, 
                                             initial_table_messages=last_messages))
    return response

@client.route('/table')
def show_table():
    return render_template('client/data_table.html')