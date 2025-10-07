from flask import Flask
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
    
    # Configure CORS properly
    CORS(app, origins=app.config['CORS_ORIGINS'], supports_credentials=True)
    
    limiter.init_app(app)

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.loans import loans_bp
    from app.routes.clients import clients_bp
    from app.routes.payments import payments_bp
    from app.routes.admin import admin_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(loans_bp, url_prefix='/api/loans')
    app.register_blueprint(clients_bp, url_prefix='/api/clients')
    app.register_blueprint(payments_bp, url_prefix='/api/payments')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')

    return app