#!/usr/bin/env python3
"""
fix_report_migration.py

One-shot repair for the failed ReportComment migration.

Run from backend/:
    python fix_report_migration.py

Steps it performs:
  1. Locate the failed migration file
  2. Clean any half-applied DB state (columns / index / unique constraint)
  3. De-duplicate ReportComment rows (safe merge — nothing is lost)
  4. Rewrite the migration with a two-step upgrade (nullable → backfill → NOT NULL)
  5. Run `flask db upgrade`
  6. Verify the columns, index and unique constraint exist

Backs up the original migration file to backend/<name>.py.bak before
overwriting it.
"""

import sys
import subprocess
from pathlib import Path

BACKEND_DIR    = Path(__file__).resolve().parent
MIGRATIONS_DIR = BACKEND_DIR / "migrations" / "versions"

BANNER = "─" * 70
def section(title):
    print(f"\n{BANNER}\n  {title}\n{BANNER}")


# ─────────────────────────────────────────────────────────────
# STEP 1 — Locate the failed migration file
# ─────────────────────────────────────────────────────────────
section("STEP 1 · Locate the failed migration file")

if not MIGRATIONS_DIR.exists():
    print(f"❌ migrations/versions not found at {MIGRATIONS_DIR}")
    print("   Run this script from the backend/ folder.")
    sys.exit(1)

# Primary match: by filename pattern
candidates = list(MIGRATIONS_DIR.glob("*report_comments_unique_identity*.py"))

# Fallback: by content
if not candidates:
    for p in MIGRATIONS_DIR.glob("*.py"):
        try:
            txt = p.read_text()
        except Exception:
            continue
        if "uq_report_comment_identity" in txt and "finalized" in txt:
            candidates.append(p)

if not candidates:
    print("❌ No matching migration file found.")
    print(f"   Looked in: {MIGRATIONS_DIR}")
    sys.exit(1)

candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
migration_file = candidates[0]
print(f"✔  Selected: {migration_file.name}")


# ─────────────────────────────────────────────────────────────
# STEP 2 — Clean any half-applied DB state
# ─────────────────────────────────────────────────────────────
section("STEP 2 · Clean any half-applied DB state")

sys.path.insert(0, str(BACKEND_DIR))

from app import create_app, db      # noqa: E402
from sqlalchemy import text         # noqa: E402

flask_app = create_app()

CLEANUP = [
    "ALTER TABLE report_comments DROP CONSTRAINT IF EXISTS uq_report_comment_identity",
    "DROP INDEX IF EXISTS ix_report_comments_finalized",
    "ALTER TABLE report_comments DROP COLUMN IF EXISTS finalized_at",
    "ALTER TABLE report_comments DROP COLUMN IF EXISTS finalized",
    "ALTER TABLE report_comments DROP COLUMN IF EXISTS phone",
    "ALTER TABLE report_comments DROP COLUMN IF EXISTS client_name",
]

with flask_app.app_context():
    for stmt in CLEANUP:
        try:
            db.session.execute(text(stmt))
            print(f"   ✔  {stmt}")
        except Exception as e:
            print(f"   ⚠  {stmt} → {e}")
            db.session.rollback()
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()


# ─────────────────────────────────────────────────────────────
# STEP 3 — De-duplicate ReportComment rows
# ─────────────────────────────────────────────────────────────
section("STEP 3 · De-duplicate ReportComment rows")

from app.models import ReportComment        # noqa: E402
from sqlalchemy import func                 # noqa: E402

with flask_app.app_context():
    dups = (db.session.query(
                ReportComment.loan_id,
                ReportComment.officer_id,
                ReportComment.report_date,
                func.count(ReportComment.id).label('n'))
            .group_by(ReportComment.loan_id,
                      ReportComment.officer_id,
                      ReportComment.report_date)
            .having(func.count(ReportComment.id) > 1)
            .all())

    print(f"   Duplicate groups found: {len(dups)}")
    deleted = 0
    for loan_id, officer_id, report_date, _ in dups:
        rows = (ReportComment.query
                .filter_by(loan_id=loan_id,
                           officer_id=officer_id,
                           report_date=report_date)
                .order_by(ReportComment.updated_at.desc().nullslast(),
                          ReportComment.id.desc())
                .all())
        keeper = rows[0]
        for old in rows[1:]:
            # Preserve comment text
            if not (keeper.comment or '').strip() and (old.comment or '').strip():
                keeper.comment = old.comment
            # Preserve newest director remark
            if old.director_remark and (
                not keeper.director_remark
                or (old.director_remark_at
                    and (not keeper.director_remark_at
                         or old.director_remark_at > keeper.director_remark_at))
            ):
                keeper.director_remark    = old.director_remark
                keeper.director_remark_by = old.director_remark_by
                keeper.director_remark_at = old.director_remark_at
            # Preserve any non-null financials
            if keeper.current_principal is None and old.current_principal is not None:
                keeper.current_principal = old.current_principal
                keeper.unpaid_interest   = old.unpaid_interest
                keeper.total_balance     = old.total_balance
                keeper.interest_rate     = old.interest_rate
                keeper.repayment_plan    = old.repayment_plan
            db.session.delete(old)
            deleted += 1
    db.session.commit()
    print(f"   ✔  Deleted {deleted} duplicate row(s)")


# ─────────────────────────────────────────────────────────────
# STEP 4 — Rewrite the migration file
# ─────────────────────────────────────────────────────────────
section("STEP 4 · Rewrite the migration file")

NEW_BODY = '''def upgrade():
    # ── 1. Add new columns (nullable first so existing rows are accepted) ──
    op.add_column('report_comments', sa.Column('client_name', sa.String(length=120), nullable=True))
    op.add_column('report_comments', sa.Column('phone', sa.String(length=20), nullable=True))
    op.add_column('report_comments', sa.Column('finalized', sa.Boolean(), nullable=True))
    op.add_column('report_comments', sa.Column('finalized_at', sa.DateTime(), nullable=True))

    # ── 2. Backfill existing rows BEFORE adding NOT NULL ──
    op.execute("UPDATE report_comments SET finalized = false WHERE finalized IS NULL")

    # ── 3. Now apply NOT NULL + server default ──
    op.alter_column(
        'report_comments', 'finalized',
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.text('false'),
    )

    # ── 4. Index + unique constraint ──
    op.create_index(
        op.f('ix_report_comments_finalized'),
        'report_comments', ['finalized'],
        unique=False,
    )
    op.create_unique_constraint(
        'uq_report_comment_identity',
        'report_comments',
        ['loan_id', 'officer_id', 'report_date'],
    )


def downgrade():
    op.drop_constraint('uq_report_comment_identity', 'report_comments', type_='unique')
    op.drop_index(op.f('ix_report_comments_finalized'), table_name='report_comments')
    op.drop_column('report_comments', 'finalized_at')
    op.drop_column('report_comments', 'finalized')
    op.drop_column('report_comments', 'phone')
    op.drop_column('report_comments', 'client_name')
'''

original = migration_file.read_text()
cut = original.find("def upgrade():")
if cut == -1:
    print("❌ Could not find 'def upgrade():' in the migration file.")
    sys.exit(1)

# One-time backup outside the versions folder (so Alembic never loads it)
backup_path = BACKEND_DIR / f"{migration_file.name}.bak"
if not backup_path.exists():
    backup_path.write_text(original)
    print(f"   ✔  Backed up original → {backup_path.name}")

new_file_content = original[:cut] + NEW_BODY
migration_file.write_text(new_file_content)
print(f"   ✔  Rewrote {migration_file.name}")


# ─────────────────────────────────────────────────────────────
# STEP 5 — Run `flask db upgrade`
# ─────────────────────────────────────────────────────────────
section("STEP 5 · Running `flask db upgrade`")

result = subprocess.run(
    ["flask", "db", "upgrade"],
    cwd=str(BACKEND_DIR),
)
if result.returncode != 0:
    print("\n❌ `flask db upgrade` failed. See output above.")
    print(f"   The original migration is saved at: {backup_path.name}")
    print("   Restore it with:  mv " + backup_path.name + " migrations/versions/" + migration_file.name)
    sys.exit(1)
print("   ✔  Migration applied cleanly")


# ─────────────────────────────────────────────────────────────
# STEP 6 — Verify
# ─────────────────────────────────────────────────────────────
section("STEP 6 · Verify")

with flask_app.app_context():
    cols = db.session.execute(text("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'report_comments'
          AND column_name IN ('finalized','finalized_at','client_name','phone')
        ORDER BY column_name
    """)).fetchall()

    if not cols:
        print("⚠  No new columns found — did the migration actually run?")
    for name, dtype, nullable, default in cols:
        print(f"   {name:<15} {dtype:<28} nullable={nullable} default={default}")

    cons = db.session.execute(text("""
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'report_comments'::regclass
          AND conname = 'uq_report_comment_identity'
    """)).fetchall()
    for (name,) in cons:
        print(f"   ✔  unique constraint present: {name}")

    idx = db.session.execute(text("""
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'report_comments'
          AND indexname = 'ix_report_comments_finalized'
    """)).fetchall()
    for (name,) in idx:
        print(f"   ✔  index present: {name}")


print("\n🎉 Done.")
print(f"   Next:  python run.py")
print(f"   Original migration preserved at:  {backup_path.name}")