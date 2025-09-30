def init_sessions(app):
    from .routes import sessions
    
    app.register_blueprint(sessions)
    return sessions