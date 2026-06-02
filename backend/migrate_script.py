# migrate_script.py
from app import create_app, db
from flask_migrate import Migrate

app = create_app()
migrate = Migrate(app, db)

with app.app_context():
    from flask_migrate import upgrade, migrate, stamp
    # You can call migrate() here