def init_telemetry_data_table(app):
    from .routes import table_api
        
    app.register_blueprint(table_api)
    
    return map