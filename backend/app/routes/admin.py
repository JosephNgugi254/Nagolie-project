from flask import Blueprint, request, jsonify
from app.utils.time import now_eat, today_eat
from flask_cors import CORS, cross_origin
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from app import db
from app.models import Client, Loan, Livestock, Transaction, User, Investor, InvestorReturn, DayAssignment, ClientAssignment, ReportComment, ReportApproval, FlaggedLoan, Role, MenuItem, RoleMenuItem, PettyCashExpense, PettyCashFunding , MessageAttachment
from app.utils.security import admin_required, log_audit
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy import func
from app.routes.payments import recalculate_loan, _loan_summary
from app.utils.decorators import role_required, role_or_username_required
import json
import secrets
import string
from app.services.ledger import record_ledger_entry   # NEW
from app.routes.payments import compute_overdue
from flask import current_app
from app.routes.payments import recalculate_loan, _loan_summary
from app.utils.interest_helpers import _get_current_period_key, _get_current_period_interest
from werkzeug.utils import secure_filename
import os
import cloudinary.uploader
from flask import url_for, send_file
import io
from app.utils.cloudinary_upload import upload_base64_image
from app.services.livestock_gallery import (
    build_admin_gallery,
    build_public_gallery,
    is_gallery_visible,
    serialize_public_single,
)

admin_bp = Blueprint('admin', __name__)

allowed_origins = [
    'http://localhost:5173',
    'https://www.nagolie.com',
    'https://nagolie.com'
]
CORS(admin_bp, origins=allowed_origins, supports_credentials=True)


# ---------------------------------------------------------------------------
# Helpers (unchanged)
# ---------------------------------------------------------------------------

def format_currency(amount):
    return f"KES {float(amount):,.2f}"

def generate_livestock_description(livestock_type, count):
    if not livestock_type:
        return 'Livestock available for purchase'
    livestock_type = livestock_type.lower()
    singular_forms = {
        'cattle': 'cow', 'goats': 'goat', 'sheep': 'sheep',
        'chickens': 'chicken', 'poultry': 'chicken', 'pigs': 'pig',
        'rabbits': 'rabbit', 'turkeys': 'turkey', 'ducks': 'duck', 'geese': 'goose'
    }
    if count == 1:
        singular = singular_forms.get(livestock_type)
        if singular:
            return f"{singular.capitalize()} available for purchase"
        if livestock_type.endswith('s') and not livestock_type.endswith('ss'):
            return f"{livestock_type[:-1].capitalize()} available for purchase"
        return f"{livestock_type.capitalize()} available for purchase"
    if livestock_type in ['sheep', 'deer', 'fish', 'cattle']:
        return f"{livestock_type.capitalize()} available for purchase"
    if not livestock_type.endswith('s'):
        return f"{livestock_type.capitalize()}s available for purchase"
    return f"{livestock_type.capitalize()} available for purchase"

def generate_credentials(investor_id):
    random_chars = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
    return f"inv{investor_id}_{random_chars}", secrets.token_urlsafe(32)

def _days_left_label(loan, today):
    if not loan.due_date:
        return 0, 'N/A'
    due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
    days_left = (due - today).days
    return days_left, days_left


# ---------- assignment sync engine ----------
def _get_assignable_loans():
    """Active loans that should appear in officer reports.
    Excludes flagged and anything whose status isn't 'active'."""
    flagged_ids = [fl.loan_id for fl in FlaggedLoan.query.filter_by(resolved=False).all()]
    q = Loan.query.filter(Loan.status == 'active')
    if flagged_ids:
        q = q.filter(~Loan.id.in_(flagged_ids))
    return q.all()

@admin_bp.route('/balance-suggest', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def suggest_balanced_distribution():
    """
    Day-aware, minimal-churn workload balancing.

    Strategy
    --------
    1. Seed from the CURRENT ClientAssignment state (manual + day_based).
       This means we only *change* what actually needs to change — the
       suggestion will be a small delta on top of reality, not a full rewrite.
    2. At each balancing step, evaluate EVERY single-client move from a
       richer officer to a poorer officer, compute the resulting global
       spread, and commit the move that reduces the spread the most.
       Manual overrides are never candidates for moving.
    3. Prefer moves whose client disbursement-day matches one of the
       receiving officer's assigned days (tiebreaker).
    4. Stop when the spread is within tolerance OR no move improves it.
    """
    from app.utils.interest_helpers import _get_current_period_interest

    officers = User.query.filter(
        User.role.in_(['secretary', 'client_relations_officer'])
    ).all()
    if not officers:
        return jsonify({'suggestions': []}), 200

    officer_ids  = [o.id for o in officers]
    officer_days = {o.id: {da.day_of_week for da in o.day_assignments} for o in officers}
    day_officers = {}
    for oid, days in officer_days.items():
        for d in days:
            day_officers[d] = oid

    # ---------- gather clients ----------
    flagged_ids = [fl.loan_id for fl in FlaggedLoan.query.filter_by(resolved=False).all()]
    q = Loan.query.filter(Loan.status == 'active')
    if flagged_ids:
        q = q.filter(~Loan.id.in_(flagged_ids))
    loans = q.all()

    clients = []
    for loan in loans:
        loan = recalculate_loan(loan, save=False)
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            interest = float(_get_current_period_interest(loan))
        else:
            interest = float(max(Decimal('0'),
                                 loan.accrued_interest - loan.interest_paid))
        clients.append({
            'loan_id': loan.id,
            'interest': interest,
            'day': loan.disbursement_date.weekday() if loan.disbursement_date else 0,
        })
    client_by_id = {c['loan_id']: c for c in clients}

    # ---------- seed from current assignments ----------
    current = {ass.loan_id: ass for ass in ClientAssignment.query.filter(
        ClientAssignment.is_active == True,
        ClientAssignment.loan_id.in_([c['loan_id'] for c in clients])
    ).all()}

    assignments   = {oid: []   for oid in officer_ids}
    totals        = {oid: 0.0  for oid in officer_ids}
    manual_locked = set()

    for c in clients:
        lid = c['loan_id']
        target = None

        # 1. Preserve whatever assignment already exists in the DB.
        if lid in current:
            oid = current[lid].officer_id
            if oid in totals:
                target = oid
                if current[lid].assignment_type == 'manual':
                    manual_locked.add(lid)

        # 2. Otherwise honour the day map.
        if target is None:
            target = day_officers.get(c['day'])

        # 3. Final fallback: least-loaded by interest so far.
        if target is None:
            target = min(officer_ids, key=lambda x: totals[x])

        assignments[target].append(lid)
        totals[target] += c['interest']

    # ---------- balancing loop ----------
    def _spread(vals):
        return max(vals) - min(vals) if vals else 0.0

    total_interest = sum(totals.values())
    avg            = total_interest / len(officers)
    tolerance      = max(2000.0, avg * 0.10)   # 10% band, min KES 2,000

    max_iter = len(clients) * 2 + 20
    for _ in range(max_iter):
        current_spread = _spread(list(totals.values()))
        if current_spread <= tolerance:
            break

        best_move       = None   # (high, low, lid, amt, day_match)
        best_new_spread = current_spread

        for high in officer_ids:
            for low in officer_ids:
                if high == low:
                    continue
                if totals[high] <= totals[low]:
                    continue   # only move from richer to poorer

                for lid in assignments[high]:
                    if lid in manual_locked:
                        continue
                    c   = client_by_id[lid]
                    amt = c['interest']

                    # Compute resulting spread without mutating state.
                    new_vals = []
                    for oid in officer_ids:
                        if oid == high:
                            new_vals.append(totals[oid] - amt)
                        elif oid == low:
                            new_vals.append(totals[oid] + amt)
                        else:
                            new_vals.append(totals[oid])
                    new_spread = max(new_vals) - min(new_vals)

                    if new_spread < best_new_spread - 0.5:
                        best_new_spread = new_spread
                        best_move = (
                            high, low, lid, amt,
                            c['day'] in officer_days.get(low, set())
                        )
                    elif (abs(new_spread - best_new_spread) < 0.5
                          and best_move is not None
                          and not best_move[4]
                          and c['day'] in officer_days.get(low, set())):
                        # Same spread but a day-matching move — prefer it.
                        best_move = (high, low, lid, amt, True)

        if best_move is None:
            break

        high, low, lid, amt, _ = best_move
        assignments[high].remove(lid)
        assignments[low].append(lid)
        totals[high] -= amt
        totals[low]  += amt

    return jsonify({'suggestions': [
        {
            'officer_id': o.id,
            'officer_name': o.username,
            'suggested_loans': assignments[o.id],
            'suggested_total_interest': totals[o.id],
        }
        for o in officers
    ]}), 200

# Keep the old name working so any other imports don't break
def refresh_day_assignments():
    sync_client_assignments()

# =============================================================================
# SNAPSHOT ENGINE
# -----------------------------------------------------------------------------
# The snapshot is whatever the live report actually showed. We never replay.
# =============================================================================

from datetime import date as _date_cls


def _compute_live_rows_for_officer(officer_id: int, report_date: _date_cls):
    """
    Compute the current live report rows for one officer.

    Uses the EXACT same computation as the Recovery Module / Reports panel —
    `recalculate_loan` + current-period interest for weekly, accrued-interest
    for daily.

    Returns a list of dicts with the fields the report table renders.
    """
    from app.routes.payments import recalculate_loan
    from app.utils.interest_helpers import (
        _get_current_period_key,
        _get_current_period_interest,
    )
    from decimal import Decimal, ROUND_HALF_UP

    # Which active loans is this officer responsible for right now?
    assignments = ClientAssignment.query.filter_by(
        officer_id=officer_id, is_active=True
    ).all()
    loan_ids = [a.loan_id for a in assignments]
    if not loan_ids:
        return []

    flagged_subq = (
        db.session.query(FlaggedLoan.loan_id)
        .filter(FlaggedLoan.resolved == False)   # noqa: E712
        .subquery()
    )

    loans = Loan.query.filter(
        Loan.id.in_(loan_ids),
        Loan.status == 'active',
        Loan.id.notin_(flagged_subq),
    ).all()

    rows = []
    for loan in loans:
        # Skip anything that did not yet exist on report_date
        if not loan.disbursement_date:
            continue
        if loan.disbursement_date.date() > report_date:
            continue

        client = loan.client
        if not client:
            continue

        # Bring the loan object fully up-to-date (no persistence)
        loan = recalculate_loan(loan, save=False)

        # --- unpaid interest — matches ReportsPanel & Recovery Module ---
        current_period = _get_current_period_key(loan)
        raw_weekly_interest = (
            Decimal(loan.current_principal or 0) * Decimal('0.30')
        ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        period_prepaid = Decimal('0')
        if loan.interest_prepaid_period == current_period:
            period_prepaid = loan.interest_prepaid_amount or Decimal('0')

        if loan.repayment_plan == 'weekly' and (loan.interest_rate or 0) > 0:
            unpaid_interest = float(
                max(Decimal('0'), raw_weekly_interest - period_prepaid)
            )
        elif loan.repayment_plan == 'daily' and (loan.interest_rate or 0) > 0:
            unpaid_interest = float(max(
                Decimal('0'),
                (loan.accrued_interest or Decimal('0'))
                - (loan.interest_paid or Decimal('0')),
            ))
        else:
            # Waived (0%) or unknown — no interest accrues
            unpaid_interest = 0.0

        current_principal = float(loan.current_principal or 0)

        rows.append({
            'loan_id':           loan.id,
            'client_name':       client.full_name,
            'phone':             client.phone_number,
            'current_principal': current_principal,
            'unpaid_interest':   unpaid_interest,
            'total_balance':     current_principal + unpaid_interest,
            'interest_rate':     float(loan.interest_rate or 0),
            'repayment_plan':    loan.repayment_plan or 'weekly',
        })

    return rows


def _persist_snapshot_rows(officer_id: int, report_date: _date_cls, rows, finalize=False):
    """
    Idempotent upsert of live rows into ReportComment.

    Guarantees:
      • `comment` and `director_remark*` are NEVER touched.
      • A row that is already `finalized=True` is NEVER overwritten or deleted.
      • After upserting, any UNFINALISED row for this (officer, date) whose
        loan is no longer in `rows` AND has no human content (comment or
        director_remark) is PRUNED from the DB. This is what stops stale
        rows from piling up and resurrecting during the end-of-day freeze.
    """
    created = updated = skipped = pruned = 0

    existing = {
        r.loan_id: r
        for r in ReportComment.query.filter_by(
            officer_id=officer_id, report_date=report_date
        ).all()
    }

    live_ids = {row['loan_id'] for row in rows}

    for row in rows:
        rc = existing.get(row['loan_id'])
        if rc is None:
            rc = ReportComment(
                loan_id=row['loan_id'],
                officer_id=officer_id,
                report_date=report_date,
                comment='',
            )
            db.session.add(rc)
            created += 1

        if rc.finalized:
            skipped += 1
            continue

        rc.current_principal = row['current_principal']
        rc.unpaid_interest   = row['unpaid_interest']
        rc.total_balance     = row['total_balance']
        rc.interest_rate     = row['interest_rate']
        rc.repayment_plan    = row['repayment_plan']
        rc.client_name       = row['client_name']
        rc.phone             = row['phone']

        if finalize:
            rc.finalized    = True
            rc.finalized_at = datetime.utcnow()

        updated += 1

    # ---- Prune stale unfinalised rows --------------------------------
    # Any row for this (officer, date) whose loan has dropped out of the
    # live set — and which has no human-supplied content — is removed.
    # This is what stops completed / superseded loans from ghosting.
    for loan_id, rc in existing.items():
        if loan_id in live_ids:
            continue
        if rc.finalized:
            continue                          # never touch a frozen row
        if rc.comment or rc.director_remark:
            continue                          # preserve human annotations
        db.session.delete(rc)
        pruned += 1
    # ------------------------------------------------------------------

    return created, updated, skipped

def refresh_today_snapshots():
    """
    Hourly job body — refresh today's snapshot for every active officer.
    Non-finalizing. Never touches remarks.
    """
    from app.utils.time import today_eat

    today = today_eat()

    officer_ids = [
        r.officer_id
        for r in db.session.query(ClientAssignment.officer_id)
        .filter(ClientAssignment.is_active == True)     # noqa: E712
        .distinct()
        .all()
    ]

    total_rows = 0
    for oid in officer_ids:
        rows = _compute_live_rows_for_officer(oid, today)
        _persist_snapshot_rows(oid, today, rows, finalize=False)
        total_rows += len(rows)

    db.session.commit()
    return {
        'date':      today.isoformat(),
        'officers':  len(officer_ids),
        'rows':      total_rows,
    }


def freeze_day_snapshots(as_of_date: _date_cls):
    """
    Freeze every unfinalised row for a given date.

    Before locking the day in, we PRUNE any row whose loan is now fully
    resolved (status in {'completed', 'claimed', 'bad_debt'}) — that
    client was no longer live at end-of-day, so it must not appear in
    the frozen report. Rows with human content (comment / director
    remark) are always preserved.

    Idempotent — running twice is a no-op on the second run.
    """
    from app.utils.time import today_eat

    if as_of_date >= today_eat():
        return {'error': 'Cannot freeze today or a future date',
                'date': as_of_date.isoformat()}

    # ---- 1. Prune stale unfinalised rows ----------------------------
    stale = ReportComment.query.filter(
        ReportComment.report_date == as_of_date,
        ReportComment.finalized == False,               # noqa: E712
    ).all()

    pruned = 0
    for rc in stale:
        if rc.comment or rc.director_remark:
            continue                                    # preserve human content
        loan = db.session.get(Loan, rc.loan_id)
        if loan is None:
            continue
        if loan.status in ('completed', 'claimed', 'bad_debt'):
            db.session.delete(rc)
            pruned += 1

    db.session.flush()

    # ---- 2. Freeze everything that remains --------------------------
    count = ReportComment.query.filter(
        ReportComment.report_date == as_of_date,
        ReportComment.finalized == False,               # noqa: E712
    ).update(
        {'finalized': True, 'finalized_at': datetime.utcnow()},
        synchronize_session=False,
    )
    db.session.commit()
    return {
        'date':           as_of_date.isoformat(),
        'finalized_rows': count,
        'pruned_rows':    pruned,
    }

# =============================================================================
# REPORT READER — the ONLY public way to get report rows
# =============================================================================

def get_assigned_clients_for_user(user_id, report_date=None):
    """
    Return report rows for one officer on one date.

    TODAY → live computation, persisted to ReportComment (unfinalized),
            then read back with comments/remarks merged in.
    PAST  → frozen snapshot ONLY, deduplicated per loan chain so that a
            mid-day renewal/waiver cannot show up twice, and fully
            resolved loans (completed / claimed / bad_debt) cannot
            appear as ghosts. Never recomputes.
    """
    from app.utils.time import today_eat

    today = today_eat()
    if report_date is None:
        report_date = today
    elif hasattr(report_date, 'date') and not isinstance(report_date, _date_cls):
        report_date = report_date.date()

    # ------------------------------------------------------------------
    # TODAY — compute, persist, read back
    # ------------------------------------------------------------------
    if report_date == today:
        live_rows = _compute_live_rows_for_officer(user_id, report_date)
        _persist_snapshot_rows(user_id, report_date, live_rows, finalize=False)
        db.session.commit()

        rc_index = {
            r.loan_id: r
            for r in ReportComment.query.filter_by(
                officer_id=user_id, report_date=report_date
            ).all()
        }

        out = []
        for row in live_rows:
            rc = rc_index.get(row['loan_id'])
            out.append({
                **row,
                'comment':            rc.comment if rc else '',
                'director_remark':    rc.director_remark if rc else '',
                'director_remark_at': rc.director_remark_at.isoformat()
                                        if rc and rc.director_remark_at else None,
                'director_remark_by': rc.director_remarker.username
                                        if rc and rc.director_remarker else None,
                'is_waiver':          row['interest_rate'] == 0,
                'report_date':        report_date.isoformat(),
            })
        return out

    # ------------------------------------------------------------------
    # PAST — frozen rows only, deduplicated per loan chain
    # ------------------------------------------------------------------
    if report_date < today:
        rows = (
            ReportComment.query
            .filter_by(officer_id=user_id, report_date=report_date)
            .order_by(ReportComment.id)
            .all()
        )

        # Group rows by chain root. Within each chain, keep ONLY the row
        # whose loan has the highest loan_id — i.e. the newest form of
        # the loan that was captured for this date. This collapses the
        # "old loan + new loan on the same day" duplicate (Stanley's bug).
        by_root = {}   # root_loan_id -> (ReportComment, Loan)
        for rc in rows:
            if rc.current_principal is None:
                continue                              # remark-only row
            loan = db.session.get(Loan, rc.loan_id)
            if not loan:
                continue
            root = loan.root_loan_id or loan.id
            prev = by_root.get(root)
            if prev is None or rc.loan_id > prev[0].loan_id:
                by_root[root] = (rc, loan)

        out = []
        for rc, loan in by_root.values():
            # Drop chains whose head loan is now fully resolved
            # (Rebecca's bug). 'renewed' / 'waived' are NOT dropped —
            # if no successor row exists for this date, the head was
            # still the live loan at end-of-day, so we keep it.
            if loan.status in ('completed', 'claimed', 'bad_debt'):
                continue

            out.append({
                'loan_id':           rc.loan_id,
                'client_name':       rc.client_name,
                'phone':             rc.phone,
                'current_principal': float(rc.current_principal or 0),
                'unpaid_interest':   float(rc.unpaid_interest or 0),
                'total_balance':     float(rc.total_balance
                                            or (rc.current_principal or 0)
                                            + (rc.unpaid_interest or 0)),
                'interest_rate':     float(rc.interest_rate or 0),
                'repayment_plan':    rc.repayment_plan or 'weekly',
                'comment':           rc.comment or '',
                'director_remark':   rc.director_remark or '',
                'director_remark_at': rc.director_remark_at.isoformat()
                                        if rc.director_remark_at else None,
                'director_remark_by': rc.director_remarker.username
                                        if rc.director_remarker else None,
                'is_waiver':          float(rc.interest_rate or 0) == 0,
                'report_date':        report_date.isoformat(),
            })
        return out

    # Future date — nothing
    return []

# ---------------------------------------------------------------------------
# Test (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/test', methods=['GET'])
@jwt_required()
def test_endpoint():
    try:
        user = db.session.get(User, int(get_jwt_identity()))
        return jsonify({'success': True, 'message': 'Admin API working',
                        'user': user.to_dict() if user else None}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Applications (pending loans) – unchanged
# ---------------------------------------------------------------------------

@admin_bp.route('/applications', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director','secretary', 'client_relations_officer', 'hr_manager'])
def get_applications():
    try:
        apps = Loan.query.filter_by(status='pending').order_by(Loan.created_at.desc()).all()
        result = []
        for app in apps:
            c = app.client
            lv = app.livestock
            result.append({
                'id': app.id,
                'date': app.created_at.isoformat() if app.created_at else None,
                'name': c.full_name if c else 'Unknown',
                'phone': c.phone_number if c else 'N/A',
                'idNumber': c.id_number if c else 'N/A',
                'loanAmount': float(app.principal_amount),
                'livestock': lv.livestock_type if lv else 'N/A',
                'livestockType': lv.livestock_type if lv else 'N/A',
                'livestockCount': lv.count if lv else 0,
                'estimatedValue': float(lv.estimated_value) if lv and lv.estimated_value else 0,
                'location': (c.location if c and c.location else None) or (lv.location if lv and lv.location else 'N/A'),
                'additionalInfo': app.notes or 'None',
                'photos': lv.photos if lv and lv.photos else [],
                'status': app.status,
                'repayment_plan': app.repayment_plan or 'weekly',
                'production_classification': lv.production_classification if lv else '',

                # ── NEW: Next of Kin ──
                'nextOfKinName':         (c.next_of_kin_name         if c else '') or '',
                'nextOfKinIdNumber':     (c.next_of_kin_id           if c else '') or '',
                'nextOfKinRelationship': (c.next_of_kin_relationship if c else '') or '',
                'nextOfKinPhone':        (c.next_of_kin_phone        if c else '') or '',
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ---------------------------------------------------------------------------
# Approve application
# ---------------------------------------------------------------------------

@admin_bp.route('/applications/<int:loan_id>/approve', methods=['POST'])
@jwt_required()
@role_or_username_required(allowed_roles=['admin', 'director'], allowed_usernames=['Annie'])
def approve_application(loan_id):
    try:
        data           = request.get_json()
        funding_source = data.get('funding_source', 'company')
        investor_id    = data.get('investor_id')

        # ---------- disbursement method + reference ----------
        disbursement_method    = (data.get('disbursement_method') or 'bank').strip().lower()
        disbursement_reference = (data.get('disbursement_reference') or '').strip()

        if disbursement_method not in ('bank', 'cash'):
            return jsonify({'error': 'disbursement_method must be "bank" or "cash"'}), 400
        if disbursement_method == 'bank' and not disbursement_reference:
            return jsonify({'error': 'Reference code is required for bank transfers'}), 400

        # ---------- NEW: valuer's collateral figures ----------
        current_market_value = data.get('current_market_value')
        forced_value         = data.get('forced_value')

        # Forced Value is mandatory and must be positive — it is the binding
        # collateral figure used everywhere downstream.
        try:
            forced_value_dec = (
                Decimal(str(forced_value))
                if forced_value not in (None, '') else None
            )
        except Exception:
            return jsonify({'error': 'forced_value must be a number'}), 400

        if forced_value_dec is None or forced_value_dec <= 0:
            return jsonify({'error': 'Forced Value is required and must be positive'}), 400

        # Current Market Value is optional (for reference only)
        try:
            current_market_dec = (
                Decimal(str(current_market_value))
                if current_market_value not in (None, '') else None
            )
        except Exception:
            return jsonify({'error': 'current_market_value must be a number'}), 400
        # --------------------------------------------------------

        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        if loan.status != 'pending':
            return jsonify({'error': 'Already processed'}), 400

        investor = None
        available_balance = None
        if funding_source == 'investor' and investor_id:
            investor = db.session.get(Investor, investor_id)
            if not investor or investor.account_status != 'active':
                return jsonify({'error': 'Invalid or inactive investor'}), 400
            total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
                Loan.investor_id == investor.id,
                Loan.funding_source == 'investor',
                Loan.status.in_(['active', 'completed'])
            ).scalar() or Decimal('0')
            available_balance = investor.current_investment - total_lent
            if loan.principal_amount > available_balance:
                return jsonify({'error': f'Insufficient funds. Available: {float(available_balance):.2f}'}), 400

        now         = datetime.utcnow()
        approver_id = int(get_jwt_identity())

        loan.status            = 'active'
        loan.disbursement_date = now

        loan.approved_by = approver_id
        loan.approved_at = now

        if loan.repayment_plan == 'daily':
            loan.interest_rate = Decimal('4.5')
            loan.interest_type = 'simple'
            loan.due_date      = now + timedelta(days=14)
        else:
            loan.interest_rate = Decimal('30.0')
            loan.interest_type = 'compound'
            loan.due_date      = now + timedelta(days=7)

        loan.total_amount               = loan.principal_amount
        loan.balance                    = loan.principal_amount
        loan.current_principal          = loan.principal_amount
        loan.principal_paid             = Decimal('0')
        loan.interest_paid              = Decimal('0')
        loan.accrued_interest           = Decimal('0')
        loan.amount_paid                = Decimal('0')
        loan.last_interest_payment_date = now

        loan.funding_source = funding_source
        if funding_source == 'investor' and investor:
            loan.investor_id = investor.id

        # ---------- transaction record ----------
        txn = Transaction(
            loan_id=loan.id,
            transaction_type='disbursement',
            amount=loan.principal_amount,
            payment_method=disbursement_method,
            reference=(disbursement_reference
                       if disbursement_method == 'bank' else None),
            notes=f'Loan approved. Plan: {loan.repayment_plan}. '
                  f'Funding: {funding_source}. Method: {disbursement_method}',
            status='completed',
            created_at=now,
            created_by=approver_id,
        )
        db.session.add(txn)

        # ---------- CHANGED: persist valuer's figures on the livestock row ----------
        if loan.livestock:
            if funding_source == 'investor' and investor:
                loan.livestock.investor_id    = investor.id
                loan.livestock.ownership_type = 'investor'
            else:
                loan.livestock.ownership_type = 'company'

            # NEW: the binding valuation — used everywhere from now on
            loan.livestock.current_market_value = current_market_dec
            loan.livestock.forced_value         = forced_value_dec
        # ---------------------------------------------------------------------------

        db.session.commit()

        # First-day interest
        from app.routes.payments import recalculate_loan
        loan = recalculate_loan(loan)
        db.session.commit()

        # ---------- ledger ----------
        record_ledger_entry(
            loan=loan,
            event_type='disbursement',
            transaction=txn,
            amount=loan.principal_amount,
            notes=f'Loan disbursed via {disbursement_method}. Plan: {loan.repayment_plan}',
            reference=(disbursement_reference if disbursement_method == 'bank' else 'CASH'),
            user_id=approver_id,
        )
        db.session.commit()

        # Auto-assign to officer for the disbursement day
        from app.models import DayAssignment, ClientAssignment
        weekday = loan.disbursement_date.weekday()
        day_assignment = DayAssignment.query.filter_by(day_of_week=weekday).first()

        if day_assignment:
            existing = ClientAssignment.query.filter_by(loan_id=loan.id, is_active=True).first()
            if not existing:
                db.session.add(ClientAssignment(
                    loan_id=loan.id,
                    officer_id=day_assignment.user_id,
                    assignment_type='day_based',
                    assigned_by=None,
                    is_active=True,
                ))
                db.session.commit()
        else:
            current_app.logger.warning(
                f"No officer assigned to weekday {weekday} for loan {loan.id}"
            )

        # ---------- CHANGED: audit trail carries the two figures ----------
        log_audit('loan_approved', 'loan', loan.id, {
            'client': loan.client.full_name if loan.client else '?',
            'amount': float(loan.principal_amount),
            'plan': loan.repayment_plan,
            'disbursement_method': disbursement_method,
            'disbursement_reference': disbursement_reference or None,
            'current_market_value': float(current_market_dec) if current_market_dec is not None else None,
            'forced_value':         float(forced_value_dec),
        })

        return jsonify({
            'success': True,
            'message': 'Loan approved successfully',
            'loan': loan.to_dict(),
            'transaction': txn.to_dict(),
            'investor_available_balance': float(available_balance - loan.principal_amount)
                if available_balance is not None else None
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500
            
# ---------------------------------------------------------------------------
# Reject application (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/applications/<int:loan_id>/reject', methods=['POST'])
@jwt_required()
@role_or_username_required(allowed_roles=['admin','director'], allowed_usernames=['Annie'])
def reject_application(loan_id):
    try:
        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Not found'}), 404
        if loan.status != 'pending':
            return jsonify({'error': 'Already processed'}), 400
        loan.status = 'rejected'
        if loan.livestock:
            loan.livestock.status = 'inactive'
        db.session.commit()
        return jsonify({'success': True, 'message': 'Rejected'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# Clients (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/clients', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def get_all_clients():
    try:
        today = datetime.now().date()
        active_loans = Loan.query.filter_by(status='active').all()
        clients_data = []

        for active_loan in active_loans:
            client = active_loan.client
            if not client:
                continue

            active_loan = recalculate_loan(active_loan, save=False)
            overdue_days, overdue_weeks = compute_overdue(active_loan, today)

            current_principal = active_loan.current_principal or active_loan.principal_amount
            principal_paid = active_loan.principal_paid or Decimal('0')
            interest_paid = active_loan.interest_paid or Decimal('0')

            # Compute unpaid interest correctly
            if active_loan.repayment_plan == 'weekly' and active_loan.interest_rate > 0:
                current_period = _get_current_period_key(active_loan)
                raw_weekly_interest = (active_loan.current_principal * Decimal('0.30')).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )
                period_prepaid = Decimal('0')
                if active_loan.interest_prepaid_period == current_period:
                    period_prepaid = active_loan.interest_prepaid_amount or Decimal('0')
                unpaid_interest = max(Decimal('0'), raw_weekly_interest - period_prepaid)
                period_interest = raw_weekly_interest
                period_interest_paid = period_prepaid >= raw_weekly_interest - Decimal('0.01')
            else:
                unpaid_interest = max(Decimal('0'), active_loan.accrued_interest - interest_paid)
                period_interest = _get_current_period_interest(active_loan)
                period_prepaid = Decimal('0')
                period_interest_paid = False
                current_period = _get_current_period_key(active_loan)
                if active_loan.interest_prepaid_period == current_period:
                    period_prepaid = active_loan.interest_prepaid_amount or Decimal('0')
                    period_interest_paid = period_prepaid >= period_interest - Decimal('0.01')

            if active_loan.due_date:
                due = active_loan.due_date.date() if hasattr(active_loan.due_date, 'date') else active_loan.due_date
                days_left = (due - today).days
            else:
                days_left = 0

            last_ip = active_loan.last_interest_payment_date
            weeks_overdue = 0
            if last_ip:
                ld = last_ip.date() if hasattr(last_ip, 'date') else last_ip
                if ld < today:
                    weeks_overdue = (today - ld).days // 7

            clients_data.append({
                'id': client.id,
                'loan_id': active_loan.id,
                'name': client.full_name,
                'phone': client.phone_number,
                'idNumber': client.id_number,
                'borrowedDate': active_loan.disbursement_date.isoformat() if active_loan.disbursement_date else None,
                'borrowedAmount': float(active_loan.principal_amount),
                'currentPrincipal': float(current_principal),
                'expectedReturnDate': active_loan.due_date.isoformat() if active_loan.due_date else None,
                'amountPaid': float(active_loan.amount_paid),
                'principalPaid': float(principal_paid),
                'interestPaid': float(interest_paid),
                'balance': float(active_loan.balance),
                'daysLeft': days_left,
                'weeks_overdue': weeks_overdue,
                'lastInterestPayment': last_ip.isoformat() if last_ip else None,
                'interest_type': active_loan.interest_type,
                'repayment_plan': active_loan.repayment_plan,
                'unpaidInterest': float(unpaid_interest),
                'accrued_interest': float(active_loan.accrued_interest),
                'current_period_interest': float(period_interest),
                'period_interest_prepaid': float(period_prepaid),
                'period_interest_fully_paid': period_interest_paid,
                'interest_rate': float(active_loan.interest_rate),
                'overdue_days': overdue_days,
                'overdue_weeks': overdue_weeks,
            })

        clients_data.sort(key=lambda x: (x['name'], x['borrowedDate'] or ''))
        return jsonify(clients_data), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        
# ---------------------------------------------------------------------------
# Dashboard (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/dashboard', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def get_dashboard_stats():
    try:
        total_clients = db.session.query(Client).join(Loan).filter(
            Loan.status.in_(['active', 'completed'])
        ).distinct().count()
        total_lent = float(db.session.query(func.sum(Loan.principal_amount)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)
        KNOWN_INFLATION = 30500
        total_lent_adj = max(0, total_lent - KNOWN_INFLATION)
        total_received = float(db.session.query(func.sum(Loan.amount_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)
        total_principal_paid = float(db.session.query(func.sum(Loan.principal_paid)).filter(
            Loan.status.in_(['active', 'completed'])
        ).scalar() or 0)
        currently_lent = float(db.session.query(func.sum(Loan.current_principal)).filter(
            Loan.status == 'active'
        ).scalar() or 0)
        available_funds = max(0, total_principal_paid - currently_lent)
        today = datetime.now().date()
        due_today_loans = Loan.query.filter(
            Loan.status == 'active',
            db.func.date(Loan.due_date) == today
        ).all()
        due_today_data = []
        for loan in due_today_loans:
            loan = recalculate_loan(loan, save=False)
            due_today_data.append({
                'id': loan.id, 'client_id': loan.client_id, 'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'phone': loan.client.phone_number if loan.client else 'N/A',
                'repayment_plan': loan.repayment_plan,
            })
        today = datetime.now().date()
        overdue_loans = Loan.query.filter(
            Loan.status == 'active',
            db.func.date(Loan.due_date) < today
        ).all()
        overdue_data = []
        for loan in overdue_loans:
            loan = recalculate_loan(loan, save=False)
            overdue_days, overdue_weeks = compute_overdue(loan, today)
            overdue_data.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'loan_id': loan.id,
                'client_name': loan.client.full_name if loan.client else 'Unknown',
                'balance': float(loan.balance),
                'current_principal': float(loan.current_principal),
                'weeks_overdue': overdue_weeks,
                'days_overdue': overdue_days,
                'repayment_plan': loan.repayment_plan,
                'phone': loan.client.phone_number if loan.client else 'N/A',
                'expectedReturnDate': loan.due_date.isoformat() if loan.due_date else None
            })
            
        return jsonify({
            'total_clients': total_clients,
            'total_lent': total_lent_adj,
            'total_received': total_received,
            'available_funds': available_funds,
            'due_today': due_today_data,
            'overdue': overdue_data
        }), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ---------------------------------------------------------------------------
# Payment stats (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/payment-stats', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def get_payment_stats():
    try:
        loans = Loan.query.filter(
            Loan.status.in_(['active', 'completed', 'claimed'])
        ).order_by(Loan.disbursement_date.desc()).all()
        stats = []
        total_principal_paid = Decimal('0')
        total_revenue        = Decimal('0')
        for loan in loans:
            pp = loan.principal_paid or Decimal('0')
            ip = loan.interest_paid  or Decimal('0')
            acc_int = loan.accrued_interest or Decimal('0')
            client = loan.client
            client_name = client.full_name if client else 'Unknown'
            client_phone = client.phone_number if client else 'N/A'
            client_id_number = client.id_number if client else 'N/A'
            stats.append({
                'id': loan.id,
                'client_id': loan.client_id,
                'name': client_name,
                'phone': client_phone,
                'id_number': client_id_number,
                'borrowed_date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                'borrowed_amount': float(loan.principal_amount),
                'principal_paid': float(pp),
                'current_principal': float(loan.current_principal or loan.principal_amount),
                'interest_paid': float(ip),
                'accrued_interest': float(acc_int),
                'expected_return_date': loan.due_date.isoformat() if loan.due_date else None,
                'status': loan.status,
                'repayment_plan': loan.repayment_plan 
            })
            total_principal_paid += pp
            total_revenue        += ip
        currently_lent = float(db.session.query(func.sum(Loan.current_principal)).filter(
            Loan.status == 'active').scalar() or 0)
        return jsonify({
            'payment_stats': stats,
            'total_principal_collected': float(total_principal_paid),
            'currently_lent': currently_lent,
            'available_for_lending': float(total_principal_paid) - currently_lent,
            'revenue_collected': float(total_revenue)
        }), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ---------------------------------------------------------------------------
# Livestock (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/livestock', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def get_all_livestock():
    try:
        page     = max(1, request.args.get('page', 1, type=int))
        per_page = max(1, request.args.get('per_page', 10, type=int))
        return jsonify(build_admin_gallery(page=page, per_page=per_page)), 200
    except Exception:
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Failed to load livestock'}), 500
    
    
@admin_bp.route('/transactions', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def get_all_transactions():
    try:
        txns = Transaction.query.order_by(Transaction.created_at.desc()).all()
        result = []
        for t in txns:
            cn = t.loan.client.full_name if t.loan and t.loan.client else 'Unknown'
            receipt = 'N/A'
            if t.payment_method == 'mpesa' and t.mpesa_receipt:
                receipt = t.mpesa_receipt
            elif t.payment_method == 'bank':
                receipt = t.reference or 'Bank Transfer'
            elif t.payment_method == 'cash':
                receipt = 'Cash'
            result.append({
                'id': t.id,
                'date': t.created_at.isoformat() if t.created_at else None,
                'clientName': cn,
                'type': t.transaction_type,
                'payment_type': t.payment_type,
                'amount': float(t.amount),
                'method': t.payment_method or 'cash',
                'status': t.status or 'completed',
                'receipt': receipt,
                'reference': t.reference,           
                'notes': t.notes or '',
                'mpesa_receipt': t.mpesa_receipt,
                'loan_id': t.loan_id,
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/livestock', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'valuer'])  # adjust roles to match your app
def add_livestock():
    data = request.get_json() or {}

    try:
        # ------------------------------------------------------------
        # 1. Validate required fields (adjust to your model)
        # ------------------------------------------------------------
        required = ['livestock_type', 'client_id']
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({
                'error': f'Missing required fields: {", ".join(missing)}'
            }), 400

        # ------------------------------------------------------------
        # 2. Upload images FIRST — fail loudly if anything breaks
        # ------------------------------------------------------------
        image_urls = []
        upload_errors = []

        for idx, img in enumerate(data.get('images') or []):
            if not img:
                continue

            # Already-uploaded URL (e.g. user kept an existing photo)
            if isinstance(img, str) and img.startswith('http'):
                image_urls.append(img)
                continue

            try:
                url = upload_base64_image(img, folder='livestock')
                if url:
                    image_urls.append(url)
                else:
                    upload_errors.append(f'image #{idx + 1}: empty URL')
            except Exception as e:
                current_app.logger.exception(
                    f"[add_livestock] image #{idx + 1} upload failed"
                )
                upload_errors.append(f'image #{idx + 1}: {e}')

        if upload_errors:
            current_app.logger.error(
                "[add_livestock] Cloudinary failures: " + "; ".join(upload_errors)
            )
            return jsonify({
                'error': 'One or more images could not be uploaded. Nothing was saved.',
                'details': upload_errors,
            }), 502

        # ------------------------------------------------------------
        # 3. Create the Livestock record
        # ------------------------------------------------------------
        lv = Livestock(
            livestock_type=data.get('livestock_type'),
            breed=data.get('breed'),
            age=data.get('age'),
            weight=data.get('weight'),
            price=data.get('price'),
            description=data.get('description'),
            client_id=data.get('client_id'),
            photos=image_urls,          # model field is `photos`
            # add any other fields your model needs
        )

        db.session.add(lv)
        db.session.commit()

        return jsonify({
            'success': True,
            'id': lv.id,
            'photos': lv.photos,
        }), 201

    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("[add_livestock] failed")
        return jsonify({
            'error': 'Failed to create livestock',
            'details': str(e),
        }), 500
    
@admin_bp.route('/livestock/<int:livestock_id>', methods=['PUT', 'PATCH'])
@jwt_required()
@role_required(['admin', 'director', 'valuer'])  # adjust roles to match your app
def update_livestock(livestock_id):
    lv = db.session.get(Livestock, livestock_id)
    if not lv:
        return jsonify({'error': 'Livestock not found'}), 404

    data = request.get_json() or {}

    try:
        # ------------------------------------------------------------
        # 1. Handle images if the client sent them
        # ------------------------------------------------------------
        if 'images' in data:
            incoming = data.get('images') or []
            final_urls = []
            upload_errors = []

            for idx, img in enumerate(incoming):
                if not img:
                    continue

                # Keep existing Cloudinary URLs
                if isinstance(img, str) and img.startswith('http'):
                    final_urls.append(img)
                    continue

                try:
                    url = upload_base64_image(img, folder='livestock')
                    if not url:
                        upload_errors.append(f'image #{idx + 1}: empty URL')
                    else:
                        final_urls.append(url)
                except Exception as e:
                    current_app.logger.exception(
                        f"[update_livestock] image #{idx + 1} upload failed for lv={livestock_id}"
                    )
                    upload_errors.append(f'image #{idx + 1}: {e}')

            if upload_errors:
                current_app.logger.error(
                    f"[update_livestock] Cloudinary failures for lv={livestock_id}: "
                    + "; ".join(upload_errors)
                )
                return jsonify({
                    'error': 'One or more images could not be uploaded. Nothing was saved.',
                    'details': upload_errors,
                }), 502

            # Only overwrite photos if every upload succeeded
            lv.photos = final_urls

        # ------------------------------------------------------------
        # 2. Update other fields if present
        # ------------------------------------------------------------
        for field in [
            'livestock_type',
            'breed',
            'age',
            'weight',
            'price',
            'description',
            'client_id',
        ]:
            if field in data:
                setattr(lv, field, data[field])

        db.session.commit()

        return jsonify({
            'success': True,
            'id': lv.id,
            'photos': lv.photos,
        }), 200

    except Exception as e:
        db.session.rollback()
        current_app.logger.exception(
            f"[update_livestock] failed for lv={livestock_id}"
        )
        return jsonify({
            'error': 'Failed to update livestock',
            'details': str(e),
        }), 500

@admin_bp.route('/livestock/<int:livestock_id>', methods=['DELETE'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def delete_livestock(livestock_id):
    try:
        lv = db.session.get(Livestock, livestock_id)
        if not lv:
            return jsonify({'error': 'Not found'}), 404
        db.session.delete(lv)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/send-reminder', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def send_reminder():
    data = request.json
    if not data.get('phone') or not data.get('message'):
        return jsonify({'success': False, 'error': 'Phone and message required'}), 400
    return jsonify({'success': False, 'error': 'SMS service not configured'}), 500


@admin_bp.route('/claim-ownership', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'head_of_it', 'hr_manager', 'client_relations_officer'])
def claim_ownership():
    try:
        data = request.get_json()
        loan = Loan.query.filter_by(id=data.get('loan_id'), status='active').first()
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404

        # Fetch livestock associated with the loan
        lv = Livestock.query.filter_by(id=loan.livestock_id).first()
        if not lv:
            return jsonify({'error': 'Livestock not found for this loan'}), 404

        # Update livestock – remove client association, make it available
        # IMPORTANT: Keep livestock in gallery for claimed loans
        loc = (lv.client.location if lv.client and lv.client.location else None) or 'Isinya, Kajiado'
        lv.description = 'Livestock for purchase'
        lv.location = loc
        lv.status = 'active'
        lv.client_id = None
        # DO NOT set loan_id to None - we want to keep the association so we know it was claimed
        # This way it will show in both galleries as "Claimed - Available now"

        # Mark loan as claimed
        loan.status = 'claimed'
        loan.balance = 0
        loan.amount_paid = loan.total_amount

        # Create transaction record
        txn = Transaction(
            loan_id=loan.id,
            transaction_type='claim',
            amount=0,
            payment_method='claim',
            notes='Claimed overdue'
        )
        db.session.add(txn)
        db.session.commit()

        # Record ledger entry
        record_ledger_entry(
            loan=loan,
            event_type='claimed',
            transaction=txn,
            amount=0,
            notes='Loan claimed – livestock repossessed',
            user_id=get_jwt_identity()
        )
        db.session.commit()

        return jsonify({'success': True, 'message': f'Claimed {lv.livestock_type}'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/loans/<int:loan_id>/topup', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'head_of_it', 'client_relations_officer', 'hr_manager'])
def process_topup(loan_id):
    """
    Process a loan top‑up or principal adjustment.
    - Top‑up: adds extra amount to current principal, keeps all interest state.
    - Adjustment: sets principal to a new value, clears prepaid markers,
      computes the correct current‑period interest on the new principal,
      and sets last_interest_payment_date to now so no retroactive interest is added.
    """
    try:
        data = request.json
        topup_amount = Decimal(str(data.get('topup_amount', 0)))
        adjustment_amount = Decimal(str(data.get('adjustment_amount', 0)))

        # At least one must be > 0
        if topup_amount == 0 and adjustment_amount == 0:
            return jsonify({'error': 'Either topup_amount or adjustment_amount must be positive'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400

        old_principal = loan.current_principal
        now = datetime.utcnow()
        txn_type = None
        txn_amt = Decimal('0')
        txn_notes = ''
        payment_method = ''

        if topup_amount > 0:
            # --- TOP‑UP: add extra amount, keep all interest state ---
            loan.current_principal += topup_amount
            loan.balance = loan.current_principal
            txn_type = 'topup'
            txn_amt = topup_amount
            txn_notes = f'Top-up of {format_currency(topup_amount)}'
            payment_method = 'topup'

        elif adjustment_amount > 0:
            # --- ADJUSTMENT: set new principal, reset interest state ---
            loan.current_principal = adjustment_amount

            # Clear prepaid markers and interest_paid
            loan.interest_prepaid_period = None
            loan.interest_prepaid_amount = Decimal('0')
            loan.interest_paid = Decimal('0')
            loan.last_interest_payment_date = now
            loan.last_compounding_date = None

            if loan.repayment_plan == 'daily' and loan.interest_rate > 0:
                period_interest = (loan.current_principal * Decimal('0.045')).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )
                loan.accrued_interest = period_interest
                loan.balance = loan.current_principal + period_interest
            else:
                # Weekly interest is always freshly derived from current_principal elsewhere
                loan.accrued_interest = Decimal('0')
                loan.balance = loan.current_principal

            txn_type = 'adjustment'
            txn_amt = adjustment_amount - old_principal
            txn_notes = f'Adjustment from {format_currency(old_principal)} → {format_currency(adjustment_amount)}'
            payment_method = 'adjustment'

        # Create transaction record
        txn = Transaction(
            loan_id=loan.id,
            transaction_type=txn_type,
            amount=txn_amt,
            payment_method=payment_method,
            notes=txn_notes,
            status='completed',
            created_at=now
        )
        db.session.add(txn)
        db.session.flush()  # to get txn.id if needed

        # Record ledger entry (using the transaction)
        record_ledger_entry(
            loan=loan,
            event_type='adjustment',
            transaction=txn,
            amount=txn_amt,
            notes=txn_notes,
            reference='ADMIN',
            user_id=get_jwt_identity()
        )

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Loan {txn_type} processed successfully',
            'loan': loan.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
                
@admin_bp.route('/approved-loans', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'hr_manager'])
def get_approved_loans():
    try:
        approver = db.aliased(User)

        loans = db.session.query(
            Loan.id, Loan.principal_amount, Loan.disbursement_date, Loan.notes,
            Loan.repayment_plan, Loan.approved_at,
            Client.full_name.label('client_name'),
            Client.phone_number, Client.id_number,
            Client.location.label('client_location'),
            Client.next_of_kin_name,
            Client.next_of_kin_id,
            Client.next_of_kin_relationship,
            Client.next_of_kin_phone,
            Livestock.livestock_type, Livestock.count,
            # ── CHANGED: pull all three value columns ──
            Livestock.estimated_value,
            Livestock.current_market_value,
            Livestock.forced_value,
            # Coalesced "collateral value" — forced value wins when present,
            # otherwise falls back to estimated_value (legacy loans).
            func.coalesce(
                Livestock.forced_value,
                Livestock.estimated_value
            ).label('collateral_value'),
            # ─────────────────────────────────────────────
            Livestock.photos, Livestock.location.label('livestock_location'),
            Livestock.production_classification,
            approver.username.label('approved_by_username'),
        ).join(Client, Loan.client_id == Client.id
        ).outerjoin(Livestock, Loan.livestock_id == Livestock.id
        ).outerjoin(approver, Loan.approved_by == approver.id
        ).filter(Loan.status == 'active'
        ).order_by(Loan.disbursement_date.desc()).limit(100).all()

        # Fallback for legacy rows: pull creator of the disbursement txn
        legacy_ids = [l.id for l in loans if not l.approved_by_username]
        legacy_map = {}
        if legacy_ids:
            rows = (db.session.query(Transaction.loan_id, User.username)
                    .join(User, Transaction.created_by == User.id)
                    .filter(Transaction.loan_id.in_(legacy_ids),
                            Transaction.transaction_type == 'disbursement')
                    .all())
            legacy_map = {lid: uname for lid, uname in rows}

        return jsonify([{
            'id': l.id,
            'date': l.disbursement_date.isoformat() if l.disbursement_date else None,
            'name': l.client_name,
            'phone': l.phone_number,
            'idNumber': l.id_number,
            'loanAmount': float(l.principal_amount),
            'livestockType': l.livestock_type or 'N/A',
            'livestockCount': l.count or 0,

            # ── CHANGED: three distinct values in the payload ──
            'collateralValue':    float(l.collateral_value)    if l.collateral_value    is not None else 0,
            'currentMarketValue': float(l.current_market_value) if l.current_market_value is not None else None,
            'forcedValue':        float(l.forced_value)        if l.forced_value        is not None else None,
            # Legacy key — kept so nothing downstream breaks
            'estimatedValue':     float(l.estimated_value)     if l.estimated_value     is not None else 0,
            # ────────────────────────────────────────────────────

            'location': l.client_location or l.livestock_location or 'N/A',
            'additionalInfo': l.notes or 'None provided',
            'photos': l.photos or [],
            'status': 'active',
            'repayment_plan': l.repayment_plan or 'weekly',
            'production_classification': l.production_classification or 'Unspecified',
            'approvedBy': l.approved_by_username or legacy_map.get(l.id, 'N/A'),
            'approvedAt': (l.approved_at.isoformat() + 'Z') if l.approved_at else None,

            'nextOfKinName':         l.next_of_kin_name         or '',
            'nextOfKinIdNumber':     l.next_of_kin_id           or '',
            'nextOfKinRelationship': l.next_of_kin_relationship or '',
            'nextOfKinPhone':        l.next_of_kin_phone        or '',
        } for l in loans]), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': 'Failed to load approved loans'}), 500
            
# ---------------------------------------------------------------------------
# Investor routes (unchanged)
# ---------------------------------------------------------------------------

@admin_bp.route('/investors', methods=['GET', 'POST'])
@jwt_required()
@role_required(['admin', 'director'])
def manage_investors():
    if request.method == 'GET':
        try:
            investors = Investor.query.all()
            result = []
            for inv in investors:
                total_lent = db.session.query(func.sum(Loan.principal_amount)).filter(
                    Loan.investor_id == inv.id, Loan.funding_source == 'investor',
                    Loan.status.in_(['active', 'completed'])
                ).scalar() or Decimal('0')
                d = inv.to_dict()
                d['total_lent_amount']  = float(total_lent)
                d['available_balance']  = float(max(Decimal('0'), inv.current_investment - total_lent))
                d['investment_amount']  = float(inv.current_investment)
                result.append(d)
            return jsonify(result), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    try:
        data = request.json
        for f in ['name', 'phone', 'id_number', 'investment_amount']:
            if not data.get(f):
                return jsonify({'error': f'Missing: {f}'}), 400
        if Investor.query.filter((Investor.phone == data['phone']) | (Investor.id_number == data['id_number'])).first():
            return jsonify({'error': 'Investor already exists'}), 400
        now = datetime.utcnow()
        inv = Investor(name=data['name'], phone=data['phone'], id_number=data['id_number'],
                       email=data.get('email'), initial_investment=Decimal(str(data['investment_amount'])),
                       current_investment=Decimal(str(data['investment_amount'])),
                       invested_date=now, expected_return_date=now + timedelta(days=35),
                       next_return_date=now + timedelta(days=35), account_status='pending', notes=data.get('notes', ''))
        db.session.add(inv); db.session.flush()
        tmp, token = generate_credentials(inv.id)
        origin = request.headers.get('Origin', 'http://localhost:5173')
        link = f"{origin}/investor/complete-registration/{inv.id}?token={token}"
        inv.notes = f"Temporary Password: {tmp}\nRegistration Token: {token}\nAccount Creation Link: {link}\nToken Generated: {now.strftime('%Y-%m-%d %H:%M:%S')}\n{inv.notes or ''}"
        inv.agreement_document = json.dumps({
            'investor_name': inv.name, 'investor_id': inv.id_number, 'phone': inv.phone,
            'email': inv.email or 'Not provided', 'investment_amount': float(inv.initial_investment),
            'date': now.strftime('%d/%m/%Y'), 'return_percentage': '40%',
            'return_amount': float(inv.initial_investment * Decimal('0.40')),
            'expected_return_period': '5 weeks first, then every 4 weeks',
            'early_withdrawal_fee': '15%', 'early_withdrawal_receivable': '85%',
            'agreement_date': now.strftime('%B %d, %Y'),
            'agreement_terms': [
                'Investor shall receive 40% return on investment amount',
                'First return after 5 weeks from investment date',
                'Subsequent returns every 4 weeks',
                'Early withdrawals incur 15% fee; investor receives 85%',
                'All returns processed via M-Pesa or bank transfer'
            ]
        })
        db.session.commit()
        return jsonify({'success': True, 'investor': inv.to_dict(), 'account_creation_link': link, 'temporary_password': tmp}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>', methods=['GET', 'PUT', 'DELETE'])
@jwt_required()
@role_required(['admin', 'director'])
def manage_investor(investor_id):
    inv = db.session.get(Investor, investor_id)
    if not inv:
        return jsonify({'error': 'Not found'}), 404
    if request.method == 'GET':
        d = inv.to_dict()
        d['returns'] = [r.to_dict() for r in InvestorReturn.query.filter_by(investor_id=inv.id).all()]
        return jsonify(d), 200
    if request.method == 'PUT':
        try:
            data = request.json
            for f in ['name', 'phone', 'email', 'account_status', 'notes']:
                if f in data: setattr(inv, f, data[f])
            if 'account_status' in data and inv.user:
                inv.user.is_active = (data['account_status'] == 'active')
            db.session.commit()
            return jsonify({'success': True, 'investor': inv.to_dict()}), 200
        except Exception as e:
            db.session.rollback(); return jsonify({'error': str(e)}), 500
    try:
        InvestorReturn.query.filter_by(investor_id=inv.id).delete()
        if inv.user: db.session.delete(inv.user)
        db.session.delete(inv); db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/calculate-return', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def calculate_investor_return(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        inv.update_outstanding(); db.session.commit()
        outstanding = inv.outstanding_returns or Decimal('0')
        next_exp    = inv.current_investment * Decimal('0.40')
        max_pay     = outstanding + next_exp
        early       = request.args.get('early_withdrawal', 'false').lower() == 'true'
        early_amt   = next_exp * Decimal('0.85') if early else next_exp
        fee_amt     = next_exp - early_amt if early else Decimal('0')
        return jsonify({
            'success': True, 'investor_id': inv.id, 'investor_name': inv.name,
            'total_investment': float(inv.current_investment),
            'outstanding_returns': float(outstanding), 'credit_balance': float(inv.credit_balance or 0),
            'next_expected_return': float(next_exp), 'max_payable': float(max_pay),
            'calculated_return': float(next_exp), 'is_early_withdrawal': early,
            'early_return_amount': float(early_amt), 'early_withdrawal_fee': float(fee_amt),
            'return_percentage': '40%',
            'next_return_date': inv.next_return_date.isoformat() if inv.next_return_date else None,
            'can_process_return': max_pay > 0
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/process-return', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def process_investor_return(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        if inv.account_status != 'active': return jsonify({'error': 'Not active'}), 400
        data   = request.json
        amount = Decimal(str(data.get('amount', 0)))
        if amount <= 0: return jsonify({'error': 'Amount must be positive'}), 400
        pm     = data.get('payment_method', 'mpesa')
        inv.update_outstanding(); db.session.flush()
        inv.total_returns_received += amount
        if amount <= inv.outstanding_returns:
            inv.outstanding_returns -= amount
        else:
            remaining = amount - inv.outstanding_returns
            inv.outstanding_returns = Decimal('0'); inv.credit_balance += remaining
        ir = InvestorReturn(investor_id=inv.id, amount=amount, return_date=datetime.utcnow(),
                            payment_method=pm, mpesa_receipt=(data.get('mpesa_receipt','') or '').upper() if pm=='mpesa' else '',
                            notes=data.get('notes',''), status='completed',
                            is_early_withdrawal=data.get('is_early_withdrawal', False), early_withdrawal_fee=Decimal('0'))
        db.session.add(ir); inv.last_return_date = datetime.utcnow(); db.session.commit()
        return jsonify({'success': True, 'return': ir.to_dict(), 'investor': inv.to_dict(),
                        'outstanding_remaining': float(inv.outstanding_returns),
                        'credit_balance': float(inv.credit_balance)}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/stats', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def get_investor_stats():
    try:
        tlv  = float(db.session.query(func.sum(Livestock.estimated_value)).filter(Livestock.status=='active').scalar() or 0)
        ai   = Investor.query.filter_by(account_status='active').all()
        pi   = Investor.query.filter_by(account_status='pending').all()
        ii   = Investor.query.filter_by(account_status='inactive').all()
        ti   = sum(float(i.current_investment) for i in ai)
        tr   = sum(float(i.total_returns_received) for i in ai)
        today= datetime.utcnow().date()
        due  = [{'id':i.id,'name':i.name,'phone':i.phone,
                 'next_return_date':i.next_return_date.isoformat(),
                 'expected_return':float(i.current_investment*Decimal('0.10')),
                 'total_returns_received':float(i.total_returns_received)}
                for i in ai if i.next_return_date and i.next_return_date.date()<=today]
        return jsonify({'total_livestock_value':tlv,'total_investors':len(ai)+len(pi)+len(ii),
                        'active_investors':len(ai),'pending_investors':len(pi),'inactive_investors':len(ii),
                        'total_investment':ti,'total_returns_paid':tr,'coverage_ratio':tlv/ti if ti else 0,
                        'due_for_returns':due}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/create-user-account', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def create_investor_user_account(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        if inv.user: return jsonify({'error': 'Already has account'}), 400
        if inv.account_status != 'pending': return jsonify({'error': 'Not pending'}), 400
        notes = inv.notes or ''
        stored = {l.split(': ',1)[0].strip(): l.split(': ',1)[1] for l in notes.split('\n') if ': ' in l}
        if all(k in stored for k in ['Temporary Password','Registration Token','Account Creation Link','Token Generated']):
            gen_time = datetime.strptime(stored['Token Generated'], '%Y-%m-%d %H:%M:%S')
            if (datetime.utcnow() - gen_time).total_seconds() < 86400:
                return jsonify({'success': True, 'message': 'Using existing credentials',
                                'link': stored['Account Creation Link'],
                                'temporary_password': stored['Temporary Password'],
                                'investor': {'id':inv.id,'name':inv.name,'phone':inv.phone,'email':inv.email}}), 200
        tmp, token = generate_credentials(inv.id)
        origin = request.headers.get('Origin', 'http://localhost:5173')
        link   = f"{origin}/investor/complete-registration/{investor_id}?token={token}"
        lines  = [l for l in notes.split('\n') if not any(l.strip().startswith(k) for k in
                  ['Temporary Password:','Registration Token:','Account Creation Link:','Token Generated:'])]
        lines += [f'Temporary Password: {tmp}', f'Registration Token: {token}',
                  f'Account Creation Link: {link}',
                  f'Token Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")}']
        inv.notes = '\n'.join(lines)
        db.session.commit()
        return jsonify({'success': True, 'link': link, 'temporary_password': tmp,
                        'investor': {'id':inv.id,'name':inv.name,'phone':inv.phone,'email':inv.email}}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/adjust-investment', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def adjust_investor_investment(investor_id):
    try:
        data   = request.json
        adj    = data.get('adjustment_type')
        amount = Decimal(str(data.get('amount')))
        if not adj or amount <= 0: return jsonify({'error': 'Invalid input'}), 400
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        old = inv.current_investment
        pm  = data.get('payment_method','cash')
        ref = (data.get('mpesa_reference','') or '').upper() if pm=='mpesa' else ''
        if adj == 'topup':
            ir = InvestorReturn(investor_id=inv.id, amount=amount, return_date=datetime.utcnow(),
                                payment_method=pm, mpesa_receipt=ref,
                                notes=f"Top-up. {data.get('notes','')}", status='completed', transaction_type='topup')
            db.session.add(ir)
            inv.current_investment += amount; inv.total_topups += amount; action='topped up'
        else:
            diff = amount - inv.current_investment
            if diff != 0:
                tt = 'adjustment_up' if diff > 0 else 'adjustment_down'
                db.session.add(InvestorReturn(investor_id=inv.id, amount=abs(diff), return_date=datetime.utcnow(),
                                              payment_method=pm, mpesa_receipt=ref,
                                              notes=f"Adj {old}→{amount}. {data.get('notes','')}", status='completed', transaction_type=tt))
            inv.current_investment = amount
            inv.total_topups = max(Decimal('0'), inv.current_investment - inv.initial_investment)
            action='adjusted'
        inv.notes = (inv.notes or '') + f"\nInvestment {action}: {old}→{inv.current_investment}"
        db.session.commit()
        return jsonify({'success': True, 'investor': inv.to_dict(),
                        'old_amount': float(old), 'new_amount': float(inv.current_investment)}), 200
    except Exception as e:
        db.session.rollback(); return jsonify({'error': str(e)}), 500


@admin_bp.route('/investor-transactions', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def get_investor_transactions():
    try:
        rows = []
        for ir in InvestorReturn.query.order_by(InvestorReturn.return_date.desc()).all():
            if not ir.investor: continue
            dt = ir.transaction_type or 'return'
            if dt == 'return' and ir.is_early_withdrawal: dt = 'early_withdrawal'
            rows.append({'id': f"investor_{ir.id}", 'date': ir.return_date.isoformat() if ir.return_date else None,
                         'type': dt, 'transaction_type': dt, 'investor_id': ir.investor.id,
                         'investor_name': ir.investor.name, 'amount': float(ir.amount),
                         'method': ir.payment_method, 'payment_method': ir.payment_method,
                         'mpesa_receipt': ir.mpesa_receipt, 'notes': ir.notes, 'status': ir.status,
                         'created_at': ir.return_date.isoformat() if ir.return_date else None})
        for loan in Loan.query.filter(Loan.funding_source=='investor', Loan.investor_id.isnot(None)).order_by(Loan.disbursement_date.desc()).all():
            if not loan.investor: continue
            rows.append({'id': f"loan_{loan.id}", 'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                         'type': 'disbursement', 'transaction_type': 'disbursement',
                         'investor_id': loan.investor.id, 'investor_name': loan.investor.name,
                         'amount': float(loan.principal_amount), 'method': 'bank', 'payment_method': 'bank',
                         'notes': f'Disbursement to {loan.client.full_name if loan.client else "?"}',
                         'status': 'completed', 'created_at': loan.disbursement_date.isoformat() if loan.disbursement_date else None})
        for inv in Investor.query.all():
            rows.append({'id': f"initial_{inv.id}", 'date': inv.invested_date.isoformat() if inv.invested_date else None,
                         'type': 'initial_investment', 'transaction_type': 'initial_investment',
                         'investor_id': inv.id, 'investor_name': inv.name,
                         'amount': float(inv.initial_investment), 'method': 'bank', 'payment_method': 'bank',
                         'notes': f'Initial investment from {inv.name}', 'status': 'completed',
                         'created_at': inv.invested_date.isoformat() if inv.invested_date else None})
        rows.sort(key=lambda x: x['date'] or '0', reverse=True)
        return jsonify(rows), 200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/investors/<int:investor_id>/statement', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def get_investor_statement(investor_id):
    try:
        inv = db.session.get(Investor, investor_id)
        if not inv: return jsonify({'error': 'Not found'}), 404
        txns    = [{'date': inv.invested_date.isoformat() if inv.invested_date else None,
                    'type': 'initial_investment', 'transaction_type': 'initial_investment',
                    'description': 'Initial Investment', 'amount': float(inv.initial_investment),
                    'balance': float(inv.initial_investment)}]
        balance = inv.initial_investment
        for r in InvestorReturn.query.filter_by(investor_id=investor_id).order_by(InvestorReturn.return_date).all():
            if r.transaction_type in ['topup','adjustment_up']:
                amt = float(r.amount); tt = r.transaction_type
            elif r.transaction_type == 'adjustment_down':
                amt = -float(r.amount); tt = 'adjustment'
            else:
                amt = -float(r.amount); tt = 'return'
            balance += amt
            txns.append({'date': r.return_date.isoformat() if r.return_date else None, 'type': tt,
                         'transaction_type': tt, 'description': r.notes or tt,
                         'amount': amt, 'balance': float(balance), 'method': r.payment_method,
                         'mpesa_receipt': r.mpesa_receipt, 'notes': r.notes})
        for loan in Loan.query.filter_by(investor_id=investor_id, funding_source='investor').order_by(Loan.disbursement_date).all():
            amt = -float(loan.principal_amount); balance += amt
            txns.append({'date': loan.disbursement_date.isoformat() if loan.disbursement_date else None,
                         'type': 'disbursement', 'transaction_type': 'disbursement',
                         'description': f'Loan to {loan.client.full_name if loan.client else "?"}',
                         'amount': amt, 'balance': float(balance), 'method': 'bank',
                         'notes': f'Principal recovered: {float(loan.principal_paid or 0)}'})
        txns.sort(key=lambda x: x['date'] or '0')
        funded = Loan.query.filter_by(investor_id=investor_id, funding_source='investor').all()
        total_returns = sum(float(r.amount) for r in InvestorReturn.query.filter_by(investor_id=investor_id) if r.transaction_type == 'return')
        return jsonify({'success': True, 'investor': inv.to_dict(), 'transactions': txns,
                        'summary': {'total_invested': float(inv.current_investment),
                                    'total_returns_paid': total_returns,
                                    'total_amount_disbursed': sum(float(l.principal_amount) for l in funded),
                                    'current_balance': float(balance),
                                    'total_loans_funded': len(funded)}}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    

# ---------------------------------------------------------------------------
# Loan renewal (with ledger and parent/root linking)
# ---------------------------------------------------------------------------

@admin_bp.route('/loans/<int:loan_id>/renew', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'head_of_it', 'deputy_director',
                'client_relations_officer', 'hr_manager'])
def renew_loan(loan_id):
    try:
        from app.routes.payments import recalculate_loan, _loan_summary
        from app.utils.cloudinary_upload import upload_base64_image
        from datetime import datetime, timedelta
        from decimal import Decimal

        data = request.get_json() or {}
        new_principal         = data.get('new_principal')
        new_repayment_plan    = data.get('new_repayment_plan')
        additional_collateral = data.get('additional_collateral')   # NEW

        loan = db.session.get(Loan, loan_id)
        if not loan:
            return jsonify({'error': 'Loan not found'}), 404
        if loan.status != 'active':
            return jsonify({'error': 'Loan is not active'}), 400

        loan = recalculate_loan(loan)

        # ---- Determine new principal ----
        if new_principal is not None:
            try:
                new_principal = Decimal(str(new_principal))
                if new_principal <= 0:
                    return jsonify({'error': 'New principal must be positive'}), 400
            except Exception:
                return jsonify({'error': 'Invalid new_principal value'}), 400
        else:
            if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
                outstanding_interest = _get_current_period_interest(loan)
            else:
                outstanding_interest = max(Decimal('0'),
                                           loan.accrued_interest - loan.interest_paid)
            new_principal = loan.current_principal + outstanding_interest
            if new_principal <= Decimal('0.01'):
                return jsonify({'error': 'No outstanding balance to renew'}), 400

        if new_repayment_plan not in ['weekly', 'daily']:
            new_repayment_plan = loan.repayment_plan

        now = datetime.utcnow()

        # ---- Preserve only MANUAL overrides ----
        old_assignment = ClientAssignment.query.filter_by(
            loan_id=loan_id, is_active=True
        ).first()

        preserve_officer_id = None
        if old_assignment:
            old_assignment.is_active = False
            if old_assignment.assignment_type == 'manual':
                preserve_officer_id = old_assignment.officer_id
            db.session.flush()

        # =====================================================================
        # NEW: Merge collateral when a revaluation was requested
        # =====================================================================
        new_livestock_id    = loan.livestock_id
        revaluation_summary = None

        if additional_collateral and int(additional_collateral.get('count') or 0) > 0:
            old_lv = db.session.get(Livestock, loan.livestock_id) if loan.livestock_id else None

            uploaded_urls = []
            for img in (additional_collateral.get('images') or []):
                try:
                    uploaded_urls.append(upload_base64_image(img, folder='livestock'))
                except Exception as e:
                    current_app.logger.warning(f"Renewal collateral image upload failed: {e}")

            new_count = int(additional_collateral.get('count') or 0)
            new_value = Decimal(str(additional_collateral.get('estimated_value') or 0))
            new_type  = (additional_collateral.get('type') or 'cattle').strip().lower()

            if old_lv:
                old_count  = int(old_lv.count or 0)
                old_value  = Decimal(str(old_lv.estimated_value or 0))
                old_type   = (old_lv.livestock_type or '').strip().lower()
                old_photos = list(old_lv.photos or [])

                combined_type = (
                    f"{old_type}+{new_type}" if old_type and old_type != new_type
                    else (old_type or new_type)
                )
                combined_total = old_value + new_value
                combined = Livestock(
                    client_id       = loan.client_id,
                    livestock_type  = combined_type,
                    count           = old_count + new_count,
                    estimated_value = combined_total,
                    description     = (f"Combined collateral: {old_count} {old_type}"
                                       f" + {new_count} {new_type}"),
                    location        = additional_collateral.get('location')
                                        or old_lv.location or 'Isinya, Kajiado',
                    photos          = old_photos + uploaded_urls,
                    status          = 'active',
                    ownership_type  = old_lv.ownership_type or 'company',
                    investor_id     = old_lv.investor_id,
                )
                revaluation_summary = {
                    'previous_type':  old_type,
                    'previous_count': old_count,
                    'previous_value': float(old_value),
                    'added_type':     new_type,
                    'added_count':    new_count,
                    'added_value':    float(new_value),
                    'combined_type':  combined_type,
                    'combined_count': old_count + new_count,
                    'combined_value': float(combined_total),
                }
            else:
                combined = Livestock(
                    client_id       = loan.client_id,
                    livestock_type  = new_type,
                    count           = new_count,
                    estimated_value = new_value,
                    description     = additional_collateral.get('description')
                                        or 'Collateral added during renewal',
                    location        = additional_collateral.get('location') or 'Isinya, Kajiado',
                    photos          = uploaded_urls,
                    status          = 'active',
                    ownership_type  = 'company',
                )
                revaluation_summary = {
                    'previous_type':  None,
                    'previous_count': 0,
                    'previous_value': 0.0,
                    'added_type':     new_type,
                    'added_count':    new_count,
                    'added_value':    float(new_value),
                    'combined_type':  new_type,
                    'combined_count': new_count,
                    'combined_value': float(new_value),
                }

            db.session.add(combined)
            db.session.flush()
            new_livestock_id = combined.id

        # ---- Mark old loan as renewed ----
        loan.status      = 'renewed'
        loan.balance     = Decimal('0')
        loan.amount_paid = loan.total_amount
        loan.notes = (loan.notes or '') + (
            f"\nRenewed on {now.isoformat()} - new principal: {new_principal}"
            + (f" | Collateral revalued" if revaluation_summary else "")
        )

        # ---- Create new loan with chosen plan ----
        if new_repayment_plan == 'daily':
            interest_rate = Decimal('4.5')
            interest_type = 'simple'
            due_date      = now + timedelta(days=14)
        else:
            interest_rate = Decimal('30.0')
            interest_type = 'compound'
            due_date      = now + timedelta(days=7)

        new_loan = Loan(
            client_id                 = loan.client_id,
            livestock_id              = new_livestock_id,     # ← updated
            principal_amount          = new_principal,
            current_principal         = new_principal,
            total_amount              = new_principal,
            balance                   = new_principal,
            interest_rate             = interest_rate,
            interest_type             = interest_type,
            repayment_plan            = new_repayment_plan,
            funding_source            = loan.funding_source,
            investor_id               = loan.investor_id,
            disbursement_date         = now,
            due_date                  = due_date,
            status                    = 'active',
            collateral_text           = loan.collateral_text,
            notes                     = (f"Renewal of loan #{loan.id} - "
                                         f"original principal {loan.principal_amount} | "
                                         f"Plan: {new_repayment_plan}"
                                         + (f" | Collateral revalued: "
                                            f"{revaluation_summary['combined_count']} "
                                            f"{revaluation_summary['combined_type']}"
                                            if revaluation_summary else "")),
            created_at                = now,
            principal_paid            = Decimal('0'),
            interest_paid             = Decimal('0'),
            accrued_interest          = Decimal('0'),
            last_interest_payment_date= now,
            interest_prepaid_period   = None,
            interest_prepaid_amount   = Decimal('0'),
            parent_loan_id            = loan.id,
            root_loan_id              = loan.root_loan_id or loan.id,
        )

        db.session.add(new_loan)
        db.session.flush()

        # ---- Assign the new loan ----
        if preserve_officer_id:
            db.session.add(ClientAssignment(
                loan_id         = new_loan.id,
                officer_id      = preserve_officer_id,
                assignment_type = 'manual',
                assigned_by     = get_jwt_identity(),
                override_reason = f'Preserved manual override from renewed loan #{loan_id}',
                is_active       = True,
            ))
        else:
            weekday = new_loan.disbursement_date.weekday()
            day_ass = DayAssignment.query.filter_by(day_of_week=weekday).first()
            if day_ass:
                db.session.add(ClientAssignment(
                    loan_id         = new_loan.id,
                    officer_id      = day_ass.user_id,
                    assignment_type = 'day_based',
                    assigned_by     = None,
                    is_active       = True,
                ))

        txn = Transaction(
            loan_id          = loan.id,
            transaction_type = 'renewal',
            amount           = new_principal,
            payment_method   = 'renewal',
            notes            = f'Loan renewed. New loan ID: {new_loan.id} | '
                               f'Plan: {new_repayment_plan}',
            status           = 'completed',
            created_at       = now,
        )
        db.session.add(txn)

        if new_loan.livestock:
            new_loan.livestock.description = (
                f"Collateral for renewed loan #{new_loan.id}"
            )

        db.session.commit()

        # ---- Ledger entries ----
        record_ledger_entry(
            loan=loan,
            event_type='renewal_merged',
            transaction=txn,
            amount=new_principal,
            notes=f'Loan renewed into new loan ID {new_loan.id}',
            reference=str(new_loan.id),
            user_id=get_jwt_identity(),
        )
        record_ledger_entry(
            loan=new_loan,
            event_type='renewal_created',
            transaction=None,
            amount=new_loan.principal_amount,
            notes=(f'Renewal of loan #{loan.id} – Plan: {new_repayment_plan}'
                   + (' | Collateral revalued' if revaluation_summary else '')),
            reference=str(loan.id),
            user_id=get_jwt_identity(),
        )
        db.session.commit()

        sync_client_assignments()

        log_audit('loan_renewed', 'loan', loan.id, {
            'old_loan_id':          loan.id,
            'new_loan_id':          new_loan.id,
            'new_principal':        float(new_principal),
            'repayment_plan':       new_repayment_plan,
            'preserved_officer_id': preserve_officer_id,
            'collateral_revalued':  bool(revaluation_summary),
        })

        return jsonify({
            'success':              True,
            'message':              f'Loan renewed. New loan ID: {new_loan.id}',
            'old_loan':             loan.to_dict(),
            'new_loan':             new_loan.to_dict(),
            'new_principal':        float(new_principal),
            'new_repayment_plan':   new_repayment_plan,
            'preserved_officer_id': preserve_officer_id,
            'revaluation':          revaluation_summary,   # NEW — null if none
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
                    
# ---------------------------------------------------------------------------
# Loan waiver (with ledger entries, parent/root linking, and original plan storage)
# ---------------------------------------------------------------------------

@admin_bp.route('/loans/<int:loan_id>/waive', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'head_of_it', 'deputy_director',
                'client_relations_officer', 'hr_manager'])
def waive_loan(loan_id):
    try:
        from app.routes.payments import recalculate_loan, _loan_summary, _get_current_period_interest
        from decimal import Decimal
        from datetime import datetime, timedelta

        data = request.get_json()
        new_principal = Decimal(str(data.get('new_principal', 0)))
        duration_days = int(data.get('duration_days', 14))

        if new_principal <= 0:
            return jsonify({'error': 'Agreed amount must be positive'}), 400
        if duration_days < 1 or duration_days > 365:
            return jsonify({'error': 'Duration must be between 1 and 365 days'}), 400

        loan = db.session.get(Loan, loan_id)
        if not loan or loan.status != 'active':
            return jsonify({'error': 'Loan not found or not active'}), 404

        loan = recalculate_loan(loan)

        # Compute current balance correctly
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            current_period_interest = _get_current_period_interest(loan)
            current_balance = loan.current_principal + current_period_interest
        else:
            current_balance = loan.current_principal + max(Decimal('0'),
                                loan.accrued_interest - loan.interest_paid)

        if new_principal > current_balance:
            return jsonify({
                'error': f'New principal cannot exceed current balance (current: {current_balance:.2f})',
                'debug_current_balance': float(current_balance),
                'debug_new_principal': float(new_principal)
            }), 400

        current_app.logger.info(
            f"Waiver: loan {loan.id}, current_principal={loan.current_principal}, "
            f"accrued_interest={loan.accrued_interest}, interest_paid={loan.interest_paid}, "
            f"computed_balance={current_balance}, new_principal={new_principal}"
        )

        reduction = current_balance - new_principal
        original_plan = loan.repayment_plan
        original_rate = loan.interest_rate

        # =====================================================================
        # FIXED: Preserve only MANUAL overrides. Day-based gets recomputed
        # from the NEW loan's disbursement weekday (which is today).
        # =====================================================================
        old_assignment = ClientAssignment.query.filter_by(
            loan_id=loan.id, is_active=True
        ).first()

        preserve_officer_id = None
        if old_assignment:
            old_assignment.is_active = False
            if old_assignment.assignment_type == 'manual':
                preserve_officer_id = old_assignment.officer_id
            db.session.flush()

        # ---- Mark old loan as waived ----
        loan.status = 'waived'
        loan.balance = Decimal('0')
        loan.amount_paid = loan.total_amount
        loan.notes = (loan.notes or '') + (
            f"\nWaived on {datetime.utcnow().isoformat()} – "
            f"reduced from {current_balance:.2f} to {new_principal:.2f}"
        )

        waiver_txn = Transaction(
            loan_id=loan.id,
            transaction_type='adjustment',
            amount=-reduction,
            payment_method='waiver',
            notes=f'Loan waived – balance reduced by {reduction:.2f} to agreed amount {new_principal:.2f}',
            status='completed',
            created_at=datetime.utcnow()
        )
        db.session.add(waiver_txn)

        now = datetime.utcnow()
        disbursement_date = now  # repayment starts today
        waived_interest_type = 'compound' if original_plan == 'weekly' else 'simple'


        new_loan = Loan(
            client_id                 = loan.client_id,
            livestock_id              = loan.livestock_id,
            principal_amount          = new_principal,
            current_principal         = new_principal,
            total_amount              = new_principal,
            balance                   = new_principal,
            interest_rate             = Decimal('0'),          # ← 0% during waiver
            interest_type             = waived_interest_type,  # ← keep compound/simple
            repayment_plan            = original_plan,         # ← KEEP original plan
            funding_source            = loan.funding_source,
            investor_id               = loan.investor_id,
            disbursement_date         = disbursement_date,
            due_date                  = disbursement_date + timedelta(days=duration_days),
            status                    = 'active',
            collateral_text           = loan.collateral_text,
            notes                     = (
                f"Waiver of loan #{loan.id}. Original balance {current_balance:.2f} "
                f"→ agreed {new_principal:.2f}. Repay within {duration_days} days. "
                f"Original plan preserved: {original_plan}."
            ),
            created_at                = now,
            principal_paid            = Decimal('0'),
            interest_paid             = Decimal('0'),
            accrued_interest          = Decimal('0'),
            last_interest_payment_date= disbursement_date,
            interest_prepaid_period   = None,
            interest_prepaid_amount   = Decimal('0'),
            parent_loan_id            = loan.id,
            root_loan_id              = loan.root_loan_id or loan.id,
            original_repayment_plan   = original_plan,         # still kept for legacy rows
            original_interest_rate    = original_rate,
        )

        db.session.add(new_loan)
        db.session.flush()

        # ---- Assign the new loan ----
        if preserve_officer_id:
            db.session.add(ClientAssignment(
                loan_id=new_loan.id,
                officer_id=preserve_officer_id,
                assignment_type='manual',
                assigned_by=get_jwt_identity(),
                override_reason=f'Preserved manual override from waived loan #{loan.id}',
                is_active=True,
            ))
        else:
            weekday = new_loan.disbursement_date.weekday()
            day_ass = DayAssignment.query.filter_by(day_of_week=weekday).first()
            if day_ass:
                db.session.add(ClientAssignment(
                    loan_id=new_loan.id,
                    officer_id=day_ass.user_id,
                    assignment_type='day_based',
                    assigned_by=None,
                    is_active=True,
                ))

        if new_loan.livestock:
            new_loan.livestock.description = f"Collateral for waived loan #{new_loan.id}"

        db.session.commit()

        # ---- Ledger entries ----
        record_ledger_entry(
            loan=loan,
            event_type='waiver',
            transaction=waiver_txn,
            amount=reduction,
            notes=f'Loan waived – reduced from {current_balance:.2f} to {new_principal:.2f}',
            reference=f'New loan ID: {new_loan.id}',
            user_id=get_jwt_identity()
        )
        record_ledger_entry(
            loan=new_loan,
            event_type='waiver_created',
            transaction=None,
            amount=new_principal,
            notes=f'Waived loan – 0% interest, {duration_days} days to repay',
            reference=f'Original loan #{loan.id}',
            user_id=get_jwt_identity()
        )
        db.session.commit()

        # ---- Guarantee parity with Recovery module ----
        sync_client_assignments()

        log_audit('loan_waived', 'loan', loan.id, {
            'old_loan_id': loan.id,
            'new_loan_id': new_loan.id,
            'old_balance': float(current_balance),
            'new_principal': float(new_principal),
            'duration_days': duration_days,
            'original_repayment_plan': original_plan,
            'original_interest_rate': float(original_rate) if original_rate else None
        })

        return jsonify({
            'success': True,
            'message': f'Loan waived. New loan ID: {new_loan.id}',
            'old_loan': loan.to_dict(),
            'new_loan': new_loan.to_dict(),
            'reduction': float(reduction)
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
            
@admin_bp.route('/revert-waived-loans', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def revert_waived_loans():
    """
    Revert waived loans whose waiver period has expired.

    A waiver = interest_rate 0 while keeping the ORIGINAL repayment_plan.
    When `due_date` has been reached, we:
      • restore the original interest_rate
      • keep the ORIGINAL repayment_plan (weekly stays weekly, daily stays daily)
      • set disbursement_date = now (so the client is re-keyed to TODAY)
      • reset accrual & payment counters
      • re-run accrual from today
      • record a ledger entry
      • reassign the officer for the NEW weekday
    """
    try:
        from app.routes.payments import recalculate_loan
        from datetime import datetime, timedelta

        now   = datetime.utcnow()
        today = now.date()

        # ⬅ FIX: use `<= now` — revert the moment the due date arrives,
        #         not one day later.
        waived_loans = Loan.query.filter(
            Loan.status == 'active',
            Loan.interest_rate == 0,
            Loan.due_date.isnot(None),
            db.func.date(Loan.due_date) < today, 
        ).all()

        reverted_count = 0
        for loan in waived_loans:

            # ---- 1. Determine the ORIGINAL plan & rate -------------------
            # Prefer the snapshot fields; fall back to parent loan.
            original_plan = loan.original_repayment_plan
            original_rate = loan.original_interest_rate

            if (not original_plan or not original_rate) and loan.parent_loan_id:
                parent = db.session.get(Loan, loan.parent_loan_id)
                if parent:
                    if not original_plan:
                        original_plan = parent.repayment_plan
                    if not original_rate or original_rate == 0:
                        original_rate = parent.interest_rate

            if not original_plan:
                original_plan = 'weekly'
            if not original_rate or original_rate == 0:
                original_rate = (Decimal('30.0') if original_plan == 'weekly'
                                 else Decimal('4.5'))

            # ---- 2. Fully-paid waivers → complete, no reversion ---------
            if loan.current_principal is None or loan.current_principal <= Decimal('0.01'):
                loan.status  = 'completed'
                loan.balance = Decimal('0')
                if loan.livestock:
                    livestock = loan.livestock
                    loan.livestock_id = None
                    db.session.delete(livestock)
                db.session.add(loan)
                continue

            # ---- 3. Restore plan/rate/type ------------------------------
            loan.repayment_plan = original_plan
            loan.interest_rate  = original_rate
            loan.interest_type  = 'compound' if original_plan == 'weekly' else 'simple'

            # ---- 4. Re-key dates so accrual restarts TODAY -------------
            loan.disbursement_date         = now      # ⬅ FIX: client is now a "today" client
            loan.last_interest_payment_date= now
            loan.last_compounding_date     = now
            loan.due_date = (now + timedelta(days=7) if original_plan == 'weekly'
                             else now + timedelta(days=14))

            # ---- 5. Reset accrual / payment tracking --------------------
            loan.accrued_interest         = Decimal('0')
            loan.interest_paid            = Decimal('0')
            loan.principal_paid           = Decimal('0')
            loan.amount_paid              = Decimal('0')
            loan.interest_prepaid_period  = None
            loan.interest_prepaid_amount  = Decimal('0')
            loan.balance                  = loan.current_principal

            # ---- 6. Apply day-0 accrual --------------------------------
            loan = recalculate_loan(loan)

            # ---- 7. Ledger + audit trail -------------------------------
            txn = Transaction(
                loan_id          = loan.id,
                transaction_type = 'adjustment',
                amount           = Decimal('0'),
                payment_method   = 'revert',
                notes            = (f'Loan reverted from waiver to {original_plan} '
                                    f'plan at {float(original_rate)}% interest'),
                status           = 'completed',
                created_at       = now,
            )
            db.session.add(txn)
            db.session.flush()

            record_ledger_entry(
                loan=loan, event_type='adjustment', transaction=txn,
                amount=Decimal('0'),
                notes=f'Reverted from waiver to {original_plan} plan',
                reference='REVERT', user_id=None,
            )

            db.session.add(loan)
            reverted_count += 1

            log_audit('loan_reverted', 'loan', loan.id, {
                'original_plan':     original_plan,
                'original_rate':     float(original_rate),
                'current_principal': float(loan.current_principal),
                'new_due_date':      loan.due_date.isoformat() if loan.due_date else None,
            })

        # ⬅ FIX: reassign officers for the NEW weekday.
        # Because we just moved `disbursement_date` to today,
        # the client must now belong to the officer who owns today.
        # sync_client_assignments() is idempotent — safe to run every call.
        from app.routes.admin import sync_client_assignments
        db.session.commit()                # commit loan changes first
        sync_client_assignments()          # then reconcile assignments

        return jsonify({
            'success':        True,
            'reverted_count': reverted_count,
            'message':        f'{reverted_count} loan(s) reverted from waiver '
                              f'to original plan',
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500
        
# ---------------------------------------------------------------------------
# Livestock single item (public)
# ---------------------------------------------------------------------------

@admin_bp.route('/livestock/<int:livestock_id>', methods=['GET'])
@cross_origin(origins="*")
def get_single_livestock(livestock_id):
    item = db.session.get(Livestock, livestock_id)
    if not item or not is_gallery_visible(item):
        return jsonify({'error': 'Livestock not found'}), 404
    return jsonify({'item': serialize_public_single(item)}), 200
# ---------------------------------------------------------------------------
# Loan statement endpoints (new)
# ---------------------------------------------------------------------------

@admin_bp.route('/loan/<int:loan_id>/ledger', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer', 'head_of_it', 'hr_manager'])
def get_loan_ledger(loan_id):
    from app.models import LoanLedger
    loan = db.session.get(Loan, loan_id)
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404
    entries = LoanLedger.query.filter_by(loan_id=loan_id).order_by(LoanLedger.event_date).all()
    return jsonify([{
        'date': e.event_date.isoformat(),
        'type': e.event_type,
        'amount': float(e.amount),
        'principalBalance': float(e.principal_balance),
        'interestBalance': float(e.interest_balance),
        'totalOutstanding': float(e.total_outstanding),
        'notes': e.notes,
        'reference': e.reference,
    } for e in entries]), 200

@admin_bp.route('/loan/<int:loan_id>/consolidated-statement', methods=['GET'])
@jwt_required()
@role_required(['admin','director','secretary','head_of_it',
                'client_relations_officer','hr_manager'])
def get_consolidated_statement(loan_id):
    from app.models import LoanLedger, Transaction

    loan = db.session.get(Loan, loan_id)
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404

    # find chain root
    root = loan
    while root.parent_loan_id:
        root = db.session.get(Loan, root.parent_loan_id)

    # gather every loan in the chain
    chain_ids, stack = [], [root.id]
    while stack:
        lid = stack.pop()
        chain_ids.append(lid)
        stack.extend([c.id for c in Loan.query.filter_by(parent_loan_id=lid)])

    entries = (LoanLedger.query
               .filter(LoanLedger.loan_id.in_(chain_ids))
               .order_by(LoanLedger.event_date, LoanLedger.sequence, LoanLedger.id)
               .all())

    txn_ids = [e.transaction_id for e in entries if e.transaction_id]
    txns = {t.id: t for t in Transaction.query.filter(Transaction.id.in_(txn_ids))}

    out = []
    for e in entries:
        t = txns.get(e.transaction_id)
        out.append({
            'id': e.id,
            'loan_id': e.loan_id,
            'date': e.event_date.isoformat(),
            'sequence': e.sequence,
            'type': e.event_type,
            'amount': float(e.amount),
            'principalBalance': float(e.principal_balance),
            'interestBalance': float(e.interest_balance),
            'totalOutstanding': float(e.total_outstanding),
            'period': e.period_label,
            'reference': e.reference,
            'notes': e.notes,
            'transaction': {
                'payment_type':    t.payment_type if t else None,
                'payment_method':  t.payment_method if t else None,
                'mpesa_receipt':   t.mpesa_receipt if t else None,
                'transaction_type':t.transaction_type if t else None,
            } if t else None,
        })
    return jsonify(out), 200

# ------------------- Report Management -------------------

@admin_bp.route('/day-assignments', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def get_day_assignments():
    """Return all officers/secretary with their assigned days."""
    # Get all users with role secretary or client_relations_officer
    users = User.query.filter(User.role.in_(['secretary', 'client_relations_officer'])).all()
    result = []
    for u in users:
        assigned_days = [da.day_of_week for da in u.day_assignments]
        result.append({
            'id': u.id,
            'username': u.username,
            'role': u.role,
            'days': assigned_days
        })
    return jsonify(result), 200

@admin_bp.route('/day-assignments', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def update_day_assignments():
    """Update day assignments for a user. Expects { user_id, days } where days is list of ints (0-6)."""
    data = request.json
    user_id = data.get('user_id')
    days = data.get('days', [])
    if not isinstance(days, list):
        return jsonify({'error': 'days must be a list'}), 400

    user = db.session.get(User, user_id)
    if not user or user.role not in ['secretary', 'client_relations_officer']:
        return jsonify({'error': 'Invalid user'}), 400

    # Remove all existing day assignments for this user
    DayAssignment.query.filter_by(user_id=user_id).delete()
    # Add new ones
    for d in days:
        da = DayAssignment(user_id=user_id, day_of_week=d)
        db.session.add(da)
    db.session.commit()

    # Rebuild all day-based client assignments
    refresh_day_assignments()
    return jsonify({'success': True}), 200

@admin_bp.route('/client-assignments', methods=['GET'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def get_all_client_assignments():
    from app.utils.interest_helpers import _get_current_period_key, _get_current_period_interest

    sync_client_assignments()

    flagged_ids = [fl.loan_id for fl in FlaggedLoan.query.filter_by(resolved=False).all()]
    loans = Loan.query.filter(
        Loan.status == 'active',
        Loan.id.notin_(flagged_ids)
    ).all()

    assignments = {}
    officers = User.query.filter(User.role.in_(['secretary', 'client_relations_officer'])).all()
    for off in officers:
        assignments[off.id] = {
            'id': off.id,
            'username': off.username,
            'role': off.role,
            'clients': [],
            'total_principal': 0,
            'total_interest': 0,
            'total_balance': 0
        }

    for loan in loans:
        loan = recalculate_loan(loan, save=False)
        ass = ClientAssignment.query.filter_by(loan_id=loan.id, is_active=True).first()
        if not ass:
            continue
        off_id = ass.officer_id
        if off_id not in assignments:
            continue

        # Calculate correct unpaid interest
        if loan.repayment_plan == 'weekly' and loan.interest_rate > 0:
            unpaid_interest = float(_get_current_period_interest(loan))
        else:
            unpaid_interest = float(max(Decimal('0'), loan.accrued_interest - loan.interest_paid))

        client_data = {
            'loan_id': loan.id,
            'client_name': loan.client.full_name,
            'phone': loan.client.phone_number,
            'current_principal': float(loan.current_principal),
            'unpaid_interest': unpaid_interest,
            'total_balance': float(loan.current_principal + Decimal(str(unpaid_interest))),
            'interest_rate': float(loan.interest_rate),
            'repayment_plan': loan.repayment_plan
        }

        assignments[off_id]['clients'].append(client_data)
        assignments[off_id]['total_principal'] += client_data['current_principal']
        assignments[off_id]['total_interest'] += client_data['unpaid_interest']
        assignments[off_id]['total_balance'] += client_data['total_balance']

    return jsonify(list(assignments.values())), 200

@admin_bp.route('/reassign-client', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager' ])
def reassign_client():
    """Manually reassign a client from one officer to another."""
    data = request.json
    loan_id = data.get('loan_id')
    new_officer_id = data.get('new_officer_id')
    reason = data.get('reason', 'Manual reassignment')

    if not loan_id or not new_officer_id:
        return jsonify({'error': 'loan_id and new_officer_id required'}), 400

    # Deactivate any current active assignment for this loan
    ClientAssignment.query.filter_by(loan_id=loan_id, is_active=True).update({'is_active': False})
    # Create new manual assignment
    new_ass = ClientAssignment(
        loan_id=loan_id,
        officer_id=new_officer_id,
        assignment_type='manual',
        assigned_by=get_jwt_identity(),
        override_reason=reason,
        is_active=True
    )
    db.session.add(new_ass)
    db.session.commit()
    return jsonify({'success': True}), 200


@admin_bp.route('/reset-day-assignments', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def reset_day_assignments():
    """Clear manual overrides and rebuild purely from day assignments."""
    ClientAssignment.query.filter_by(assignment_type='manual', is_active=True)\
        .update({'is_active': False})
    db.session.commit()
    sync_client_assignments()
    return jsonify({'success': True}), 200

@admin_bp.route('/apply-suggestion', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def apply_suggestion():
    """
    Apply a proposed layout but be surgical:
      • No-op if the loan is already with the right officer via the day map.
      • No-op if the loan is already correct as a manual override.
      • Otherwise deactivate and create a new assignment — day_based when the
        target officer matches the loan's weekday, manual otherwise.
    """
    data = request.json or {}
    suggestions = data.get('suggestions', [])

    # loan_id -> officer_id
    proposed = {}
    for item in suggestions:
        for lid in item.get('suggested_loans', []):
            proposed[lid] = item['officer_id']

    day_officers = {da.day_of_week: da.user_id for da in DayAssignment.query.all()}

    for lid, oid in proposed.items():
        curr = ClientAssignment.query.filter_by(loan_id=lid, is_active=True).first()
        loan = db.session.get(Loan, lid)
        expected_day_officer = None
        if loan and loan.disbursement_date:
            expected_day_officer = day_officers.get(loan.disbursement_date.weekday())

        # Already correct? (day-based or manual) — skip
        if curr and curr.officer_id == oid:
            if curr.assignment_type == 'manual':
                continue
            if curr.assignment_type == 'day_based' and expected_day_officer == oid:
                continue

        # Otherwise reassign
        if curr:
            curr.is_active = False

        use_day_based = (expected_day_officer == oid)
        db.session.add(ClientAssignment(
            loan_id=lid,
            officer_id=oid,
            assignment_type='day_based' if use_day_based else 'manual',
            assigned_by=None if use_day_based else get_jwt_identity(),
            override_reason=None if use_day_based else 'Auto-balanced by system',
            is_active=True,
        ))

    db.session.commit()
    return jsonify({'success': True}), 200

# ================== Role Management ==================
@admin_bp.route('/roles', methods=['GET'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def get_roles():
    roles = Role.query.all()
    return jsonify([r.to_dict() for r in roles]), 200

@admin_bp.route('/roles', methods=['POST'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def create_role():
    data = request.json
    name = data.get('name')
    if not name or Role.query.filter_by(name=name).first():
        return jsonify({'error': 'Role name required or already exists'}), 400
    role = Role(name=name, description=data.get('description', ''))
    db.session.add(role)
    db.session.flush()
    # assign menu items from data['menu_items'] list of keys
    menu_keys = data.get('menu_items', [])
    for key in menu_keys:
        menu_item = MenuItem.query.filter_by(key=key).first()
        if menu_item:
            db.session.add(RoleMenuItem(role_id=role.id, menu_item_id=menu_item.id))
    db.session.commit()
    return jsonify(role.to_dict()), 201

@admin_bp.route('/roles/<int:role_id>', methods=['PUT'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def update_role(role_id):
    role = Role.query.get_or_404(role_id)
    data = request.json
    role.name = data.get('name', role.name)
    role.description = data.get('description', role.description)
    # update menu items
    if 'menu_items' in data:
        RoleMenuItem.query.filter_by(role_id=role.id).delete()
        for key in data['menu_items']:
            menu_item = MenuItem.query.filter_by(key=key).first()
            if menu_item:
                db.session.add(RoleMenuItem(role_id=role.id, menu_item_id=menu_item.id))
    db.session.commit()
    return jsonify(role.to_dict()), 200

@admin_bp.route('/roles/<int:role_id>', methods=['DELETE'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def delete_role(role_id):
    role = Role.query.get_or_404(role_id)
    if role.name in ['admin', 'director']:  # protect core roles
        return jsonify({'error': 'Cannot delete system role'}), 400
    db.session.delete(role)
    db.session.commit()
    return jsonify({'success': True}), 200

@admin_bp.route('/menu-items', methods=['GET'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def get_menu_items():
    items = MenuItem.query.order_by(MenuItem.order).all()
    return jsonify([i.to_dict() for i in items]), 200

@admin_bp.route('/users', methods=['GET'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def get_users():
    users = User.query.all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'email': u.email,
        'role': u.role,
        'created_at': u.created_at.isoformat(),
    } for u in users]), 200

@admin_bp.route('/users', methods=['POST'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def create_user():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    role_name = data.get('role')

    if not all([username, email, password, role_name]):
        return jsonify({'error': 'Missing fields'}), 400
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({'error': 'Username or email exists'}), 400
    role = Role.query.filter_by(name=role_name).first()
    if not role:
        return jsonify({'error': 'Invalid role'}), 400

    user = User(username=username, email=email, role=role_name)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({'success': True, 'user': user.to_dict()}), 201

@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.json
    if 'role' in data:
        role = Role.query.filter_by(name=data['role']).first()
        if not role:
            return jsonify({'error': 'Invalid role'}), 400
        user.role = data['role']
    if 'password' in data and data['password']:
        user.set_password(data['password'])
    db.session.commit()
    return jsonify({'success': True}), 200

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin'])
def delete_user(user_id):
    user = User.query.get_or_404(user_id)
    if user.role == 'admin' and User.query.filter_by(role='admin').count() <= 1:
        return jsonify({'error': 'Cannot delete the only admin'}), 400
    db.session.delete(user)
    db.session.commit()
    return jsonify({'success': True}), 200

@admin_bp.route('/officers', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'head_of_it', 'hr_manager'])
def get_officers():
    users = User.query.filter(User.role.in_(['secretary', 'client_relations_officer', 'valuer'])).all()
    return jsonify([{
        'id': u.id,
        'username': u.username,
        'role': u.role,
        'default_branch': u.default_branch or 'all'
    } for u in users]), 200

@admin_bp.route('/reports/client-assignment', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager', 'secretary', 'client_relations_officer'])
def client_assignment_search():
    q = request.args.get('q', '')
    if not q:
        return jsonify([])

    clients = Client.query.filter(
        db.or_(
            Client.full_name.ilike(f'%{q}%'),
            Client.id_number.ilike(f'%{q}%'),
            Client.phone_number.ilike(f'%{q}%')
        )
    ).all()

    result = []
    for client in clients:
        loans = Loan.query.filter_by(client_id=client.id, status='active').all()
        for loan in loans:
            ass = ClientAssignment.query.filter_by(loan_id=loan.id, is_active=True).first()
            officer = ass.officer if ass else None
            flagged = FlaggedLoan.query.filter_by(loan_id=loan.id, resolved=False).first()
            result.append({
                'client_id': client.id,
                'client_name': client.full_name,
                'id_number': client.id_number,
                'phone': client.phone_number,
                'loan_id': loan.id,
                'assigned_officer': officer.username if officer else 'Unassigned',
                'officer_role': officer.role if officer else None,
                'is_flagged': flagged is not None
            })
    return jsonify(result), 200

@admin_bp.route('/reports/officer', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director', 'head_of_it', 'hr_manager'])
def get_officer_report():
    officer_id      = request.args.get('officer_id')
    report_date_str = request.args.get('date')
    if not officer_id or not report_date_str:
        return jsonify({'error': 'officer_id and date required'}), 400
    try:
        report_date = datetime.strptime(report_date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format'}), 400

    officer = db.session.get(User, officer_id)
    if not officer or officer.role not in ['secretary', 'client_relations_officer']:
        return jsonify({'error': 'Invalid officer'}), 400

    # Shared helper now handles live vs. historical correctly
    return jsonify(get_assigned_clients_for_user(int(officer_id), report_date=report_date)), 200

@admin_bp.route('/loans/<int:loan_id>', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director','head_of_it', 'hr_manager', 'secretary', 'client_relations_officer', 'valuer'])
def get_loan(loan_id):
    from app.routes.payments import recalculate_loan
    from app.utils.interest_helpers import _get_current_period_key, _get_current_period_interest
    from decimal import Decimal

    loan = Loan.query.get(loan_id)
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404

    # Recalculate to get fresh values
    loan = recalculate_loan(loan, save=False)

    current_period = _get_current_period_key(loan)
    raw_weekly_interest = (loan.current_principal * Decimal('0.30')).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    period_prepaid = Decimal('0')
    period_fully_paid = False
    if loan.interest_prepaid_period == current_period:
        period_prepaid = loan.interest_prepaid_amount or Decimal('0')
        period_fully_paid = period_prepaid >= raw_weekly_interest - Decimal('0.01')

    # Build the response dict from loan.to_dict() and add computed fields
    response = loan.to_dict()
    response['current_period_interest'] = float(raw_weekly_interest)
    response['period_interest_prepaid'] = float(period_prepaid)
    response['period_interest_fully_paid'] = period_fully_paid

    client = loan.client
    response['name'] = client.full_name if client else 'Unknown'
    response['contacts'] = client.phone_number if client else 'N/A'
    response['id_number'] = client.id_number if client else 'N/A'

    return jsonify(response), 200

@admin_bp.route('/users/<int:user_id>/branch', methods=['PUT'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def update_user_branch(user_id):
    data = request.json
    branch = data.get('branch')
    if branch not in ['all', 'isinya', 'emarti']:
        return jsonify({'error': 'Invalid branch'}), 400
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    user.default_branch = branch
    db.session.commit()
    return jsonify({'success': True, 'branch': branch}), 200

@admin_bp.route('/attachment/<int:attachment_id>', methods=['GET'])
@cross_origin(origins=allowed_origins, supports_credentials=True)
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer'])
def get_attachment(attachment_id):
    att = MessageAttachment.query.get_or_404(attachment_id)
    return send_file(
        io.BytesIO(att.file_data),
        mimetype=att.mime_type,
        as_attachment=True,
        download_name=att.filename
    )

@admin_bp.route('/upload', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'secretary', 'client_relations_officer'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        original_name = request.form.get('originalName', file.filename)

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Check if it's an image
        if file.mimetype and file.mimetype.startswith('image/'):
            # Upload to Cloudinary
            upload_result = cloudinary.uploader.upload(
                file,
                folder='petty_cash_attachments',
                resource_type='image'
            )
            return jsonify({
                'url': upload_result.get('secure_url'),
                'name': original_name
            }), 200
        else:
            # Store non‑image in database
            attachment = MessageAttachment(
                filename=original_name,
                mime_type=file.mimetype or 'application/octet-stream',
                file_data=file.read()
            )
            db.session.add(attachment)
            db.session.commit()
            # Build absolute URL (you may use url_for with _external=True)
            url = url_for('admin.get_attachment', attachment_id=attachment.id, _external=True)
            return jsonify({
                'url': url,
                'name': original_name
            }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@admin_bp.route('/sync-assignments', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director', 'hr_manager'])
def sync_assignments_endpoint():
    sync_client_assignments()
    return jsonify({'success': True}), 200

def _get_assignable_loans():
    """Active loans that should appear in officer reports.
    Excludes flagged and anything whose status isn't 'active'."""
    flagged_ids = [fl.loan_id for fl in FlaggedLoan.query.filter_by(resolved=False).all()]
    q = Loan.query.filter(Loan.status == 'active')
    if flagged_ids:
        q = q.filter(~Loan.id.in_(flagged_ids))
    return q.all()


def sync_client_assignments():
    """
    Idempotent reconciliation of ClientAssignment rows against reality.

    Rules:
      • Manual overrides are NEVER touched — they are the user's intent.
      • Any active loan without an active assignment gets one, based on the
        officer assigned to its disbursement weekday.
      • Any day_based assignment whose officer no longer matches the day map
        is updated in place.
      • Any active assignment for a loan that is no longer assignable
        (flagged / bad_debt / completed / renewed / waived) is deactivated.
      • Loans whose weekday has no officer fall back to the least-loaded
        officer — never left unassigned (guarantees report parity).
    """
    day_officers = {da.day_of_week: da.user_id for da in DayAssignment.query.all()}
    assignable   = _get_assignable_loans()
    assignable_ids = {l.id for l in assignable}

    # 1. Deactivate assignments for loans that should no longer appear
    if assignable_ids:
        ClientAssignment.query.filter(
            ClientAssignment.is_active == True,
            ~ClientAssignment.loan_id.in_(assignable_ids)
        ).update({'is_active': False}, synchronize_session=False)
    else:
        ClientAssignment.query.filter_by(is_active=True).update(
            {'is_active': False}, synchronize_session=False
        )

    # 2. Build a live load map.
    eligible_officers = User.query.filter(
        User.role.in_(['secretary', 'client_relations_officer'])
    ).all()
    officer_load = {o.id: 0 for o in eligible_officers}
    for row in (ClientAssignment.query
                .filter_by(is_active=True)
                .with_entities(ClientAssignment.officer_id).all()):
        if row.officer_id in officer_load:
            officer_load[row.officer_id] += 1

    # 3. Reconcile each active loan
    for loan in assignable:
        existing = ClientAssignment.query.filter_by(
            loan_id=loan.id, is_active=True
        ).first()

        # Manual override — authoritative, leave untouched
        if existing and existing.assignment_type == 'manual':
            continue

        # Determine expected officer from the loan's current disbursement day
        expected = None
        if loan.disbursement_date:
            expected = day_officers.get(loan.disbursement_date.weekday())

        # Fallback: least-loaded officer (still guarantees parity)
        if expected is None and officer_load:
            expected = min(officer_load, key=officer_load.get)
            officer_load[expected] = officer_load.get(expected, 0) + 1

        if expected is None:
            if existing:
                existing.is_active = False
            continue

        if existing and existing.assignment_type == 'day_based':
            if existing.officer_id != expected:
                existing.officer_id = expected
        elif not existing:
            db.session.add(ClientAssignment(
                loan_id=loan.id,
                officer_id=expected,
                assignment_type='day_based',
                assigned_by=None,
                is_active=True,
            ))

    db.session.commit()


# ---------------------------------------------------------------------------
# One-time backfill: default legacy loans to the Director user account
# ---------------------------------------------------------------------------

@admin_bp.route('/backfill-approvers', methods=['POST'])
@jwt_required()
@role_required(['admin'])
def backfill_approvers():
    """
    Point every legacy loan that has no approver at the Director account.
    Its username shows as "Director" in the Approved Loans table.
    Loans approved from today onward are stamped by approve_application()
    with the actual approver's id — so this never touches them.
    """
    now = datetime.utcnow()

    # Find the Director user (role = 'director')
    director = (
        User.query
        .filter(User.role == 'director')
        .order_by(User.created_at.asc())
        .first()
    )
    if not director:
        return jsonify({
            'success': False,
            'error':   'No Director account exists — create one first.'
        }), 400

    legacy_loans = Loan.query.filter(Loan.approved_by.is_(None)).all()

    for loan in legacy_loans:
        loan.approved_by = director.id
        loan.approved_at = loan.approved_at or loan.disbursement_date or now

    db.session.commit()

    return jsonify({
        'success':              True,
        'total_missing_before': len(legacy_loans),
        'updated':              len(legacy_loans),
        'fallback_username':    director.username,   # will print "Director"
    }), 200

@admin_bp.route('/reports/close-day', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def close_day_report():
    """
    Freeze completed day(s). Never recomputes. Body:
        { "date": "YYYY-MM-DD" }  or
        { "start_date": "...", "end_date": "..." }
    """
    from app.utils.time import today_eat

    data = request.get_json() or {}
    start_str = data.get('start_date') or data.get('date')
    end_str   = data.get('end_date')   or data.get('date')

    if not start_str:
        return jsonify({'error': 'date or start_date required'}), 400
    if not end_str:
        end_str = start_str

    try:
        start_date = datetime.strptime(start_str, '%Y-%m-%d').date()
        end_date   = datetime.strptime(end_str,   '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format'}), 400

    if end_date < start_date:
        return jsonify({'error': 'end_date before start_date'}), 400

    today = today_eat()
    if end_date >= today:
        end_date = today - timedelta(days=1)
        if end_date < start_date:
            return jsonify({'error': 'No completed days in the range'}), 400

    days = []
    current = start_date
    while current <= end_date:
        days.append(freeze_day_snapshots(current))
        current += timedelta(days=1)

    return jsonify({'success': True, 'days': days}), 200

# ===========================================================================
# Director approval + remarks on daily loan reports
# ===========================================================================

@admin_bp.route('/reports/director-view', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def director_report_view():
    officer_id = request.args.get('officer_id')
    date_str   = request.args.get('date')
    if not officer_id or not date_str:
        return jsonify({'error': 'officer_id and date required'}), 400
    try:
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format'}), 400

    officer = db.session.get(User, int(officer_id))
    if not officer or officer.role not in ['secretary', 'client_relations_officer']:
        return jsonify({'error': 'Invalid officer'}), 400

    # The helper now carries director_remark along with everything else.
    rows = get_assigned_clients_for_user(int(officer_id), report_date=report_date)

    approval = ReportApproval.query.filter_by(
        officer_id=int(officer_id), report_date=report_date
    ).first()

    return jsonify({
        'clients': rows,
        'approval': {
            'status':           approval.status if approval else 'pending',
            'general_remarks':  approval.general_remarks if approval else '',
            'approved_by':      approval.approver.username if approval and approval.approver else None,
            'approved_at':      approval.approved_at.isoformat() if approval and approval.approved_at else None,
            'updated_at':       approval.updated_at.isoformat() if approval else None,
        },
    }), 200

@admin_bp.route('/reports/director-remark', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def set_director_client_remark():
    """
    Upsert the director's per-client remark.

    Never touches `comment` or the frozen financial columns.
    Creates a partial row if none exists (financials left NULL until EOD).
    """
    data = request.get_json() or {}
    officer_id  = data.get('officer_id')
    date_str    = data.get('report_date')
    loan_id     = data.get('loan_id')
    remark      = (data.get('remark') or '').strip()

    if not all([officer_id, date_str, loan_id]):
        return jsonify({'error': 'officer_id, report_date, loan_id required'}), 400
    try:
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date'}), 400

    officer = db.session.get(User, int(officer_id))
    if not officer or officer.role not in ['secretary', 'client_relations_officer']:
        return jsonify({'error': 'Invalid officer_id'}), 400

    loan = db.session.get(Loan, int(loan_id))
    if not loan:
        return jsonify({'error': 'Loan not found'}), 404

    row = ReportComment.query.filter_by(
        loan_id=int(loan_id),
        officer_id=int(officer_id),
        report_date=report_date,
    ).first()

    if row is None:
        # Create a partial row — financials intentionally NULL until EOD.
        row = ReportComment(
            loan_id=int(loan_id),
            officer_id=int(officer_id),
            report_date=report_date,
            comment='',
        )
        db.session.add(row)
        db.session.flush()

    # ONLY the remark fields change
    row.director_remark    = remark if remark else None
    row.director_remark_by = int(get_jwt_identity()) if remark else None
    row.director_remark_at = datetime.utcnow() if remark else None

    db.session.commit()
    return jsonify({
        'success': True,
        'director_remark': row.director_remark or '',
        'director_remark_at': row.director_remark_at.isoformat() if row.director_remark_at else None,
    }), 200


@admin_bp.route('/reports/director-general-remark', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def set_director_general_remark():
    data = request.get_json() or {}
    officer_id  = data.get('officer_id')
    date_str    = data.get('report_date')
    general     = (data.get('general_remarks') or '').strip()

    if not all([officer_id, date_str]):
        return jsonify({'error': 'officer_id and report_date required'}), 400
    try:
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date'}), 400

    approval = ReportApproval.query.filter_by(
        officer_id=int(officer_id), report_date=report_date
    ).first()
    if not approval:
        approval = ReportApproval(
            officer_id=int(officer_id),
            report_date=report_date,
            status='pending',
        )
        db.session.add(approval)

    approval.general_remarks = general if general else None
    db.session.commit()
    return jsonify({'success': True, 'general_remarks': approval.general_remarks or ''}), 200

@admin_bp.route('/reports/approve', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def approve_report():
    """
    Mark the (officer, report_date) report as APPROVED.
    Body: { officer_id, report_date }
    Idempotent.
    """
    data = request.get_json() or {}
    officer_id  = data.get('officer_id')
    date_str    = data.get('report_date')

    if not all([officer_id, date_str]):
        return jsonify({'error': 'officer_id and report_date required'}), 400
    try:
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date'}), 400

    approval = ReportApproval.query.filter_by(
        officer_id=int(officer_id), report_date=report_date
    ).first()
    if not approval:
        approval = ReportApproval(
            officer_id=int(officer_id),
            report_date=report_date,
            status='pending',
        )
        db.session.add(approval)

    approval.status      = 'approved'
    approval.approved_by = int(get_jwt_identity())
    approval.approved_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'success': True,
        'status': 'approved',
        'approved_by': approval.approver.username if approval.approver else None,
        'approved_at': approval.approved_at.isoformat(),
    }), 200


@admin_bp.route('/reports/unapprove', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def unapprove_report():
    """
    Revert an approved report back to pending. Body: { officer_id, report_date }
    """
    data = request.get_json() or {}
    officer_id  = data.get('officer_id')
    date_str    = data.get('report_date')
    if not all([officer_id, date_str]):
        return jsonify({'error': 'officer_id and report_date required'}), 400
    try:
        report_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date'}), 400

    approval = ReportApproval.query.filter_by(
        officer_id=int(officer_id), report_date=report_date
    ).first()
    if not approval:
        return jsonify({'success': True, 'status': 'pending'}), 200

    approval.status      = 'pending'
    approval.approved_by = None
    approval.approved_at = None
    db.session.commit()
    return jsonify({'success': True, 'status': 'pending'}), 200

@admin_bp.route('/reports/audit', methods=['GET'])
@jwt_required()
@role_required(['admin', 'director'])
def audit_reports():
    """
    Snapshot health: per-day counts of finalized / unfinalized / NULL rows.
    No replay is performed — audit is purely a coverage check.
    """
    from app.utils.time import today_eat

    start_str = request.args.get('start_date')
    end_str   = request.args.get('end_date')

    today = today_eat()
    end_date = (
        datetime.strptime(end_str, '%Y-%m-%d').date()
        if end_str else today - timedelta(days=1)
    )
    start_date = (
        datetime.strptime(start_str, '%Y-%m-%d').date()
        if start_str else end_date - timedelta(days=30)
    )

    days = []
    current = start_date
    while current <= end_date:
        rows = ReportComment.query.filter_by(report_date=current).all()
        final  = sum(1 for r in rows if r.finalized)
        unfin  = sum(1 for r in rows if not r.finalized)
        nulls  = sum(1 for r in rows if r.current_principal is None)
        days.append({
            'date':            current.isoformat(),
            'total_rows':      len(rows),
            'finalized':       final,
            'unfinalized':     unfin,
            'null_financials': nulls,
        })
        current += timedelta(days=1)

    return jsonify({'range': f'{start_date} → {end_date}', 'days': days}), 200

@admin_bp.route('/reports/refresh-today', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def refresh_today_endpoint():
    """Manually trigger the hourly snapshot refresh (useful for testing)."""
    result = refresh_today_snapshots()
    return jsonify({'success': True, **result}), 200


@admin_bp.route('/reports/freeze-day', methods=['POST'])
@jwt_required()
@role_required(['admin', 'director'])
def freeze_day_endpoint():
    """Freeze a single completed day. Body: { "date": "YYYY-MM-DD" }."""
    data = request.get_json() or {}
    date_str = data.get('date')
    if not date_str:
        return jsonify({'error': 'date required'}), 400
    try:
        target = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return jsonify({'error': 'Invalid date format'}), 400

    result = freeze_day_snapshots(target)
    if 'error' in result:
        return jsonify(result), 400
    return jsonify({'success': True, **result}), 200