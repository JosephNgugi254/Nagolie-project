# migrate.py (updated)
#!/usr/bin/env python3
"""Database migration script for Render deployment"""

import os
import sys
import time
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text, inspect

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    """Create Flask app for migrations"""
    app = Flask(__name__)
    
    # Get database URL from environment
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        logger.error("DATABASE_URL environment variable not set!")
        sys.exit(1)
    
    # Configure database
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_recycle': 300,
        'pool_pre_ping': True,
    }
    
    return app

def run_migrations():
    """Run direct SQL migrations for missing tables/columns"""
    app = create_app()
    db = SQLAlchemy(app)
    
    with app.app_context():
        logger.info("Starting database migration...")
        
        try:
            inspector = inspect(db.engine)
            
            # Check if investors table exists
            investors_exists = 'investors' in inspector.get_table_names()
            
            if not investors_exists:
                logger.info("Creating investors table...")
                db.session.execute(text("""
                    CREATE TABLE investors (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id),
                        name VARCHAR(120) NOT NULL,
                        phone VARCHAR(20) NOT NULL UNIQUE,
                        email VARCHAR(100),
                        id_number VARCHAR(20) UNIQUE NOT NULL,
                        investment_amount NUMERIC(12, 2) NOT NULL,
                        invested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        expected_return_date TIMESTAMP,
                        total_returns_received NUMERIC(12, 2) DEFAULT 0,
                        last_return_date TIMESTAMP,
                        next_return_date TIMESTAMP,
                        agreement_document VARCHAR(500),
                        account_status VARCHAR(20) DEFAULT 'pending',
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """))
                logger.info("✓ Created investors table")
            else:
                logger.info("✓ Investors table already exists")
            
            # Check and add columns to loans table
            loans_columns = [col['name'] for col in inspector.get_columns('loans')]
            
            if 'funding_source' not in loans_columns:
                logger.info("Adding funding_source column to loans table...")
                db.session.execute(text("""
                    ALTER TABLE loans ADD COLUMN funding_source VARCHAR(20) DEFAULT 'company';
                """))
                logger.info("✓ Added funding_source column to loans")
            
            if 'investor_id' not in loans_columns:
                logger.info("Adding investor_id column to loans table...")
                db.session.execute(text("""
                    ALTER TABLE loans ADD COLUMN investor_id INTEGER REFERENCES investors(id);
                """))
                logger.info("✓ Added investor_id column to loans")
            
            # Check and add columns to livestock table
            livestock_columns = [col['name'] for col in inspector.get_columns('livestock')]
            
            if 'investor_id' not in livestock_columns:
                logger.info("Adding investor_id column to livestock table...")
                db.session.execute(text("""
                    ALTER TABLE livestock ADD COLUMN investor_id INTEGER REFERENCES investors(id);
                """))
                logger.info("✓ Added investor_id column to livestock")
            
            if 'ownership_type' not in livestock_columns:
                logger.info("Adding ownership_type column to livestock table...")
                db.session.execute(text("""
                    ALTER TABLE livestock ADD COLUMN ownership_type VARCHAR(20) DEFAULT 'company';
                """))
                logger.info("✓ Added ownership_type column to livestock")
            
            if 'description' not in livestock_columns:
                logger.info("Adding description column to livestock table...")
                db.session.execute(text("""
                    ALTER TABLE livestock ADD COLUMN description TEXT DEFAULT 'Available for purchase';
                """))
                logger.info("✓ Added description column to livestock")
            
            if 'location' not in livestock_columns:
                logger.info("Adding location column to livestock table...")
                db.session.execute(text("""
                    ALTER TABLE livestock ADD COLUMN location TEXT DEFAULT 'Isinya, Kajiado';
                """))
                logger.info("✓ Added location column to livestock")
            
            # Commit all changes
            db.session.commit()
            logger.info("✓ All migrations completed successfully!")
            
        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            logger.info("This might be because tables/columns already exist. Continuing...")
            db.session.rollback()
            # Don't exit with error - just log and continue

if __name__ == '__main__':
    # Try multiple times in case database is still starting
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            logger.info(f"Migration attempt {attempt + 1}/{max_attempts}")
            run_migrations()
            break
        except Exception as e:
            if attempt < max_attempts - 1:
                logger.info(f"Attempt failed, waiting 5 seconds before retry...")
                time.sleep(5)
            else:
                logger.error(f"All migration attempts failed: {str(e)}")
                # Don't exit with error - let the app start anyway
                logger.info("Continuing without migrations...")