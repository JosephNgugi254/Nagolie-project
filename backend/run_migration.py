# run_migration.py
from app import create_app, db
from flask_migrate import Migrate

app = create_app()
migrate = Migrate(app, db)

with app.app_context():
    from flask_migrate import upgrade, migrate, stamp
    # stamp head (optional, if database already exists)
    stamp()
    # generate migration
    migrate(message="add client assignments and report comments")
    # apply it
    upgrade()