"""
Single source of truth for livestock gallery eligibility.

A Livestock is gallery-visible iff:
  • Livestock.status == 'active'  AND
  • Livestock.client_id IS NULL                                       (admin-added / claimed)
    OR
    EXISTS a Loan referencing this Livestock with
    Loan.status IN ('active', 'claimed', 'waived')

Notes:
  • 'waived' is treated as live: waiving creates a follow-up active loan at
    0% interest. Including 'waived' guards against partial-failure edge cases
    where the follow-up wasn't created — the livestock should still show.
  • Renewals share the same Livestock row: the OLD loan becomes 'renewed'
    (hidden) but the NEW loan is 'active' (keeps the row visible). No
    special-casing needed.
  • Claimed livestock: `claim_ownership()` clears `client_id` and sets
    loan.status='claimed'. Both paths keep it visible.
  • Multi-loan rows are collapsed to a single gallery entry (no duplicate
    rows from joins / repeated transactions).
"""
from datetime import datetime

from sqlalchemy import select, or_

from app import db
from app.models import Livestock, Loan

# Statuses that keep a livestock row visible via a loan reference.
KEEPING_LOAN_STATUSES = ('active', 'claimed', 'waived')

# Priority order used when we need to pick "the" display loan for a row.
_LOAN_PRIORITY = {
    'active':    0,
    'claimed':   1,
    'waived':    2,
    'renewed':   3,
    'completed': 4,
    'rejected':  5,
    'bad_debt':  6,
    'pending':   7,
}


# ---------------------------------------------------------------------------
# Eligibility
# ---------------------------------------------------------------------------

def gallery_visible_query():
    """SQLAlchemy query returning gallery-eligible Livestock rows."""
    keeping_ids = (
        select(Loan.livestock_id)
        .where(Loan.status.in_(KEEPING_LOAN_STATUSES))
        .where(Loan.livestock_id.isnot(None))
    )
    return (
        Livestock.query
        .filter(Livestock.status == 'active')
        .filter(or_(
            Livestock.client_id.is_(None),   # admin-added OR claimed
            Livestock.id.in_(keeping_ids),   # tied to an active / claimed / waived loan
        ))
    )


def is_gallery_visible(livestock) -> bool:
    """Python-side check for a single row (used by single-item endpoint)."""
    if livestock is None or livestock.status != 'active':
        return False
    if livestock.client_id is None:
        return True
    return db.session.query(
        Loan.query
        .filter(Loan.livestock_id == livestock.id)
        .filter(Loan.status.in_(KEEPING_LOAN_STATUSES))
        .exists()
    ).scalar()


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def best_loan_for_display(livestock_id):
    """Return the most relevant Loan for a livestock row, or None.
    Priority: active > claimed > waived > renewed > completed > rejected > bad_debt.
    Tiebreak: newest created_at first."""
    loans = Loan.query.filter_by(livestock_id=livestock_id).all()
    if not loans:
        return None
    loans.sort(key=lambda l: (
        _LOAN_PRIORITY.get(l.status, 99),
        -(l.created_at.timestamp() if l.created_at else 0),
    ))
    return loans[0]


def _clean_loc(raw):
    loc = str(raw or '').strip()
    if not loc or loc in ('NaN', 'None'):
        return 'Isinya, Kajiado'
    if '|' in loc:
        p1, p2 = [p.strip() for p in loc.split('|', 1)]
        kw = ['isinya', 'kajiado', 'town', 'county', 'moonlight', 'kwa', 'timo']
        loc = (p2 if any(k in p2.lower() for k in kw)
               else p1 if any(k in p1.lower() for k in kw)
               else 'Isinya, Kajiado')
    if 'available' in loc.lower() or 'claimed' in loc.lower():
        loc = 'Isinya, Kajiado'
    return loc


def _clean_desc(raw):
    desc = str(raw or '').strip()
    if not desc or desc in ('NaN', 'None'):
        return 'Livestock for purchase'
    if '|' in desc:
        desc = desc.split('|', 1)[0].strip()
    return desc


def build_display_meta(livestock, today=None):
    """Compute display fields for one livestock row.

    Returns a dict with:
        is_claimed, is_admin_added, description, available_info,
        days_remaining, ownership_type, investor_name, client_name
    """
    today = today or datetime.utcnow().date()
    loan = best_loan_for_display(livestock.id)

    is_claimed     = bool(loan and loan.status == 'claimed')
    is_admin_added = (livestock.client_id is None and loan is None)

    ownership_type = livestock.ownership_type or 'company'
    investor_name  = livestock.investor.name if livestock.investor else None

    client_name = None
    if loan and loan.client:
        client_name = loan.client.full_name
    elif livestock.client:
        client_name = livestock.client.full_name

    # -------- Admin-added --------
    if is_admin_added:
        return {
            'is_claimed':     False,
            'is_admin_added': True,
            'description':    _clean_desc(livestock.description) or 'Available for purchase',
            'available_info': 'Available now',
            'days_remaining': 0,
            'ownership_type': ownership_type,
            'investor_name':  investor_name,
            'client_name':    None,
        }

    # -------- Claimed --------
    if is_claimed:
        return {
            'is_claimed':     True,
            'is_admin_added': False,
            'description':    f"Claimed from {client_name}" if client_name else "Claimed",
            'available_info': 'Available now',
            'days_remaining': 0,
            'ownership_type': ownership_type,
            'investor_name':  investor_name,
            'client_name':    client_name,
        }

    # -------- Active / waived (still-live) loan --------
    if loan and loan.status in ('active', 'waived'):
        label = f"Collateral for {client_name or 'Unknown'}"

        if loan.due_date:
            due = loan.due_date.date() if hasattr(loan.due_date, 'date') else loan.due_date
            days = (due - today).days
            if days > 0:
                return {
                    'is_claimed':     False,
                    'is_admin_added': False,
                    'description':    label,
                    'available_info': f'Available in {days} days',
                    'days_remaining': days,
                    'ownership_type': ownership_type,
                    'investor_name':  investor_name,
                    'client_name':    client_name,
                }
            if days == 0:
                return {
                    'is_claimed':     False,
                    'is_admin_added': False,
                    'description':    label,
                    'available_info': 'Available after Today',
                    'days_remaining': 0,
                    'ownership_type': ownership_type,
                    'investor_name':  investor_name,
                    'client_name':    client_name,
                }
            return {
                'is_claimed':     False,
                'is_admin_added': False,
                'description':    label,
                'available_info': 'Available (OD)',
                'days_remaining': 0,
                'ownership_type': ownership_type,
                'investor_name':  investor_name,
                'client_name':    client_name,
            }
        return {
            'is_claimed':     False,
            'is_admin_added': False,
            'description':    label,
            'available_info': 'Available after repayment',
            'days_remaining': 7,
            'ownership_type': ownership_type,
            'investor_name':  investor_name,
            'client_name':    client_name,
        }

    # Defensive fallback — should not be reached for an eligible row.
    return {
        'is_claimed':     False,
        'is_admin_added': True,
        'description':    'Available for purchase',
        'available_info': 'Available now',
        'days_remaining': 0,
        'ownership_type': ownership_type,
        'investor_name':  investor_name,
        'client_name':    None,
    }


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def _public_description(meta):
    """
    Public-safe description. NEVER contains a client name.

    Admin view uses the full 'Claimed from X' / 'Collateral for Y' text
    (see serialize_admin); the public website must not leak borrower identity.
    """
    if meta['is_admin_added'] or meta['is_claimed']:
        return 'Livestock available for purchase'
    # Active-loan collateral → generic. No client name.
    return 'Livestock for purchase'


def serialize_public(livestock, today=None):
    """
    Public-safe fields only.

    Exposes: id, title, type, count, price, description, images,
             availableInfo, daysRemaining, location.
    Hides:   client name/phone/ID, investor name, ownership type,
             admin flags, claim status, internal status string.
    """
    m = build_display_meta(livestock, today)
    return {
        'id':            livestock.id,
        'title':         f"{livestock.livestock_type.capitalize()} - {livestock.count} head",
        'type':          livestock.livestock_type,
        'count':         livestock.count,
        'price':         float(livestock.estimated_value) if livestock.estimated_value else 0,
        'description':   _public_description(m),           # ← generic, no PII
        'images':        livestock.photos or [],
        'availableInfo': m['available_info'],
        'daysRemaining': m['days_remaining'],
        'location':      _clean_loc(livestock.location),
    }

def serialize_admin(livestock, today=None):
    """Admin-safe fields — adds status flags and investor ownership."""
    m = build_display_meta(livestock, today)
    return {
        'id':             livestock.id,
        'title':          f"{livestock.livestock_type.capitalize()} - {livestock.count} head",
        'type':           livestock.livestock_type,
        'count':          livestock.count,
        'price':          float(livestock.estimated_value) if livestock.estimated_value else 0,
        'description':    m['description'],
        'images':         livestock.photos or [],
        'availableInfo':  m['available_info'],
        'daysRemaining':  m['days_remaining'],
        'location':       _clean_loc(livestock.location),
        'status':         livestock.status,
        'isAdminAdded':   m['is_admin_added'],
        'ownership_type': m['ownership_type'],
        'investor_name':  m['investor_name'],
        'is_claimed':     m['is_claimed'],
    }


# ---------------------------------------------------------------------------
# Paginated payload builders (used by both endpoints)
# ---------------------------------------------------------------------------

def _paginate(items, page, per_page):
    total = len(items)
    pages = (total + per_page - 1) // per_page if total else 0
    start = (page - 1) * per_page
    return items[start:start + per_page], total, pages


def build_public_gallery(page=1, per_page=12):
    today = datetime.utcnow().date()
    rows  = gallery_visible_query().all()

    # Preserve previous UX: "Available now" first, then shortest daysRemaining.
    decorated = [(lv, serialize_public(lv, today)) for lv in rows]
    decorated.sort(key=lambda pair: (
        0 if 'now' in pair[1]['availableInfo'].lower() else 1,
        pair[1]['daysRemaining'],
        -pair[0].id,
    ))

    page_items, total, pages = _paginate([d[1] for d in decorated], page, per_page)
    return {
        'items':        page_items,
        'total':        total,
        'pages':        pages,
        'current_page': page,
        'per_page':     per_page,
    }


def build_admin_gallery(page=1, per_page=10):
    today = datetime.utcnow().date()
    rows  = (
        gallery_visible_query()
        .order_by(Livestock.id.desc())   # newest first; safe regardless of created_at
        .all()
    )
    serialized = [serialize_admin(lv, today) for lv in rows]
    page_items, total, pages = _paginate(serialized, page, per_page)
    return {
        'items':        page_items,
        'total':        total,
        'pages':        pages,
        'current_page': page,
        'per_page':     per_page,
    }


def serialize_public_single(livestock):
    return serialize_public(livestock)