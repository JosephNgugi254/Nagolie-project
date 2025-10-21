# app/__init__.py
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)

# Import your Config class or define it here
from app.config import Config  # Adjust the import path as needed

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    
    # Configure CORS 
    import os  
    frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:5173')
    CORS(app,
     origins=[
         frontend_url,
         "http://localhost:5173",
         "https://nagolie-frontend.onrender.com"
     ],
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "Accept"],
     methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    
    limiter.init_app(app)

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.loans import loans_bp
    from app.routes.clients import clients_bp
    from app.routes.payments import payments_bp
    from app.routes.admin import admin_bp
    from app.routes.test_daraja import test_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(loans_bp, url_prefix='/api/loans')
    app.register_blueprint(clients_bp, url_prefix='/api/clients')
    app.register_blueprint(payments_bp, url_prefix='/api/payments')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(test_bp, url_prefix='/api/test')  # Register test routes

    @app.before_request
    def before_request():
        if request.method == "OPTIONS":
            response = jsonify({"status": "success"})
            response.headers.add("Access-Control-Allow-Origin", "*")
            response.headers.add("Access-Control-Allow-Headers", "*")
            response.headers.add("Access-Control-Allow-Methods", "*")
            return response

    return app