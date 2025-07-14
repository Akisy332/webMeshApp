import sqlite3
from datetime import datetime
from flask import Flask, render_template, jsonify, g, request, redirect, url_for
import threading
import os
from werkzeug.utils import secure_filename

DATABASE = 'database.db'
ALLOWED_EXTENSIONS = {'txt', 'csv'}


def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
