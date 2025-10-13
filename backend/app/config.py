import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # Database
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://localhost/nagolie_db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # JWT - FIXED CONFIGURATION
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)
    JWT_IDENTITY_CLAIM = 'sub'  # Explicitly set identity claim
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5173').split(',')
    
    # Daraja (M-Pesa)
    DARAJA_CONSUMER_KEY = os.getenv('DARAJA_CONSUMER_KEY', '')
    DARAJA_CONSUMER_SECRET = os.getenv('DARAJA_CONSUMER_SECRET', '')
    DARAJA_SHORTCODE = os.getenv('DARAJA_SHORTCODE', '')
    DARAJA_PASSKEY = os.getenv('DARAJA_PASSKEY', '')
    DARAJA_ENV = os.getenv('DARAJA_ENV', 'sandbox') 
    DARAJA_CALLBACK_URL = os.getenv('DARAJA_CALLBACK_URL', 'http://localhost:5000/api/payments/callback')
    
    # Callback Security
    CALLBACK_SECRET_TOKEN = os.getenv('CALLBACK_SECRET_TOKEN', 'change-this-secret-token')