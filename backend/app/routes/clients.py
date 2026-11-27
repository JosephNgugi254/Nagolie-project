from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError
from app import db
from app.models import Client, Livestock
from app.schemas.loan_schema import ClientSchema, LivestockSchema
from app.utils.security import log_audit
from flask import current_app

clients_bp = Blueprint('clients', __name__)

@clients_bp.route('', methods=['GET'])
@jwt_required()
def get_clients():
    """Get all clients"""
    clients = Client.query.order_by(Client.created_at.desc()).all()
    return jsonify([client.to_dict() for client in clients]), 200

@clients_bp.route('/<int:client_id>', methods=['GET'])
@jwt_required()
def get_client(client_id):
    """Get client details with loans and livestock"""
    client = db.session.get(Client, client_id)
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    client_data = client.to_dict()
    client_data['loans'] = [loan.to_dict() for loan in client.loans.all()]
    client_data['livestock'] = [livestock.to_dict() for livestock in client.livestock.all()]
    
    return jsonify(client_data), 200

@clients_bp.route('', methods=['POST'])
@jwt_required()
def create_client():
    """Create new client"""
    schema = ClientSchema()
    
    try:
        data = schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    # Check if client with ID number already exists
    if Client.query.filter_by(id_number=data['id_number']).first():
        return jsonify({'error': 'Client with this ID number already exists'}), 400
    
    client = Client(**data)
    db.session.add(client)
    db.session.commit()
    
    log_audit('client_created', 'client', client.id, {'name': client.full_name})
    
    return jsonify(client.to_dict()), 201


@clients_bp.route('/<int:client_id>', methods=['PUT'])
@jwt_required()
def update_client(client_id):
    """Safely update client information without allowing identity reassignment."""

    client = db.session.get(Client, client_id)

    if not client:
        return jsonify({'error': 'Client not found'}), 404

    # Safely read submitted JSON
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict) or not payload:
        return jsonify({
            'success': False,
            'error': 'Please provide valid client information.'
        }), 400

    schema = ClientSchema()

    try:
        data = schema.load(payload, partial=True)

    except ValidationError as err:
        return jsonify({
            'success': False,
            'errors': err.messages
        }), 400

    # Prevent changes to a client's registered identity.
    if 'id_number' in data:
        submitted_id = str(data['id_number'] or '').strip()
        existing_id = str(client.id_number or '').strip()

        if submitted_id != existing_id:
            return jsonify({
                'success': False,
                'error': 'A client ID number cannot be changed through this endpoint. Contact an authorized administrator for identity verification.',
                'code': 'CLIENT_ID_CHANGE_RESTRICTED'
            }), 409

        # Do not unnecessarily rewrite the identity field.
        data.pop('id_number')

    if 'full_name' in data:
        submitted_name = ' '.join(
            str(data['full_name'] or '').split()
        ).casefold()

        existing_name = ' '.join(
            str(client.full_name or '').split()
        ).casefold()

        if submitted_name != existing_name:
            return jsonify({
                'success': False,
                'error': "A client's registered name cannot be changed through this endpoint. Contact an authorized administrator for identity verification.",
                'code': 'CLIENT_NAME_CHANGE_RESTRICTED'
            }), 409

        # Do not unnecessarily rewrite the identity field.
        data.pop('full_name')

    if not data:
        return jsonify({
            'success': False,
            'error': 'No editable client information was provided.'
        }), 400

    try:
        # Update permitted client profile information.
        for key, value in data.items():
            setattr(client, key, value)

        db.session.commit()

        log_audit(
            'client_updated',
            'client',
            client.id,
            {
                'name': client.full_name,
                'updated_fields': list(data.keys())
            }
        )

        return jsonify(client.to_dict()), 200

    except Exception:
        db.session.rollback()

        current_app.logger.exception(
            "Failed to update client ID %s",
            client_id
        )

        return jsonify({
            'success': False,
            'error': 'An error occurred while updating the client. No changes were saved.'
        }), 500
