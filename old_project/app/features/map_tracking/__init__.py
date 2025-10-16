def init_map_tracking(app):
    from .routes import map
        
    app.register_blueprint(map)
    
    return map