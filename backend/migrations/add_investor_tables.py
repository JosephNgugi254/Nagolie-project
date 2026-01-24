#!/usr/bin/env python3
"""
Migration script to add investor tables to existing database.
Run: python migrations/add_investor_tables.py
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models import Investor, InvestorReturn

app = create_app()

with app.app_context():
    # Create tables
    try:
        Investor.__table__.create(db.engine, checkfirst=True)
        InvestorReturn.__table__.create(db.engine, checkfirst=True)
        print("✅ Investor tables created successfully!")
        
        # Update User model if needed
        from sqlalchemy import text
        db.session.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS investor_id INTEGER REFERENCES investors(id)
        """))
        db.session.commit()
        print("✅ Database updated successfully!")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        db.session.rollback()