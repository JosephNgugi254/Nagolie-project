# routes/staff.py
from flask import Blueprint, jsonify
from app.models import Staff

staff_bp = Blueprint('staff', __name__)

@staff_bp.route('/api/staff/<staff_number>', methods=['GET'])
def get_staff_profile(staff_number):
    staff = Staff.query.filter_by(staff_number=staff_number).first()
    if not staff:
        return jsonify({'error': 'Staff not found'}), 404
    return jsonify(staff.to_dict(public=True))