from flask import (
    Blueprint,
    request,
    make_response,
    render_template,
)

# from app.models.right import Right

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
    response = make_response(render_template("client/index.html"))
    return response

@client.route('/table')
def show_table():
    return render_template('client/data_table.html')