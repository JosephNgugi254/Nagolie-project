"""
Unauthenticated, read-only endpoints for the public website.

The livestock gallery MUST be reachable without a JWT — the marketing site
calls it anonymously. Never expose client PII or admin-only fields here.
"""
from flask import Blueprint, request, jsonify
from flask_cors import CORS, cross_origin

from app import db
from app.models import Livestock
from app.services.livestock_gallery import (
    build_public_gallery,
    serialize_public_single,
    is_gallery_visible,
)

public_bp = Blueprint('public', __name__)

# Public CORS — allow the marketing site and local dev.
CORS(
    public_bp,
    origins=[
        'http://localhost:5173',
        'https://nagolie-frontend.onrender.com',
        'https://www.nagolie.com',
        'https://nagolie.com',
    ],
    supports_credentials=False,
)


@public_bp.route('/livestock/gallery', methods=['GET', 'OPTIONS'])
@cross_origin(origins="*")
def public_livestock_gallery():
    """Read-only, paginated livestock gallery for the public site."""
    if request.method == 'OPTIONS':
        return '', 200
    try:
        page     = max(1, request.args.get('page', 1, type=int))
        per_page = min(50, max(1, request.args.get('per_page', 12, type=int)))
        return jsonify(build_public_gallery(page=page, per_page=per_page)), 200
    except Exception:
        import traceback; traceback.print_exc()
        # Fail-soft: return empty gallery instead of a 500 so the site still renders.
        return jsonify({
            'items': [], 'total': 0, 'pages': 0,
            'current_page': 1, 'per_page': 12,
            'error': 'Failed to load gallery',
        }), 200


@public_bp.route('/livestock/<int:livestock_id>', methods=['GET', 'OPTIONS'])
@cross_origin(origins="*")
def public_single_livestock(livestock_id):
    """Read-only single livestock item used by deep-links (#gallery?livestock=id)."""
    if request.method == 'OPTIONS':
        return '', 200
    item = db.session.get(Livestock, livestock_id)
    if not item or not is_gallery_visible(item):
        return jsonify({'error': 'Livestock not found'}), 404
    return jsonify({'item': serialize_public_single(item)}), 200