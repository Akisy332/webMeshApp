def init_data_management(app):
    from .routes import database
    
    app.register_blueprint(database)
    return database