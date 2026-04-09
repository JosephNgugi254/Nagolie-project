#!/usr/bin/env python
import os
import click
import logging
from flask_migrate import Migrate, upgrade, stamp
from app import create_app, db
from app.models import User, Investor, Loan, Client, PasswordResetToken, Livestock
from app.utils.cloudinary_upload import upload_base64_image
from app.utils.extensions import socketio

app = create_app()
migrate = Migrate(app, db)

@app.cli.command()
def deploy():
    """Run deployment tasks."""
    # Run database migrations
    upgrade()
    
    # Create or update initial data
    seed_admin()
    
    print("✅ Deployment completed successfully.")

@app.cli.command()
def init_db():
    """Initialize the database."""
    with app.app_context():
        # Initialize Flask-Migrate
        from flask_migrate import init as migrate_init
        migrate_init()
        print("Flask-Migrate initialized.")
        
        # Stamp the database as current (if this is an existing database)
        stamp()
        print("Database stamped with current migration.")
        
        click.echo('Database initialized for migrations.')

@app.cli.command()
def seed_admin():
    """Create default admin user."""
    with app.app_context():
        admin = User.query.filter_by(username='admin').first()
        
        if admin:
            click.echo('Admin user already exists.')
            return
        
        admin = User(
            username='admin',
            email='admin@nagolie.com',
            role='admin'
        )
        admin.set_password('admin123')  # Change this in production!
        
        db.session.add(admin)
        db.session.commit()
        
        click.echo('Admin user created successfully.')
        click.echo('Username: admin')
        click.echo('Password: admin123')
        click.echo('IMPORTANT: Change the password immediately!')

@app.cli.command()
def health_check():
    """Health check endpoint for Render."""
    try:
        # Test database connection
        db.session.execute('SELECT 1')
        return "OK", 200
    except Exception as e:
        return f"Database error: {str(e)}", 500

@app.route('/api/health')
def health():
    try:
        db.session.execute('SELECT 1')
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

@app.cli.command('migrate-images')
def migrate_images():
    """Migrate existing livestock images from database to Cloudinary."""
    with app.app_context():
        logging.basicConfig(level=logging.INFO)
        logger = logging.getLogger(__name__)

        livestock_list = Livestock.query.all()
        total = len(livestock_list)
        logger.info(f"Found {total} livestock records.")

        for idx, livestock in enumerate(livestock_list, 1):
            if not livestock.photos:
                logger.info(f"[{idx}/{total}] Livestock ID {livestock.id} has no photos, skipping.")
                continue

            original_photos = livestock.photos
            if not isinstance(original_photos, list):
                logger.warning(f"Livestock ID {livestock.id} photos is not a list, skipping.")
                continue

            new_photo_urls = []
            for img in original_photos:
                # If it's already a URL (shouldn't happen), keep it
                if isinstance(img, str) and img.startswith('http'):
                    new_photo_urls.append(img)
                    continue

                try:
                    url = upload_base64_image(img, folder='livestock')
                    new_photo_urls.append(url)
                    logger.info(f"Uploaded image for livestock ID {livestock.id}")
                except Exception as e:
                    logger.error(f"Failed to upload image for livestock ID {livestock.id}: {str(e)}")
                    continue

            if new_photo_urls:
                livestock.photos = new_photo_urls
                db.session.commit()
                logger.info(f"Updated livestock ID {livestock.id} with {len(new_photo_urls)} Cloudinary URLs.")
            else:
                logger.warning(f"Livestock ID {livestock.id} had no successfully uploaded images, leaving unchanged.")

        logger.info("Migration completed.")

if __name__ == '__main__':
    app.run()