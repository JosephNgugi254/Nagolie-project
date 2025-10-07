from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from marshmallow import ValidationError
from app import db
from app.models import Client, Livestock
from app.schemas.loan_schema import ClientSchema, LivestockSchema
from app.utils.security import log_audit

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
    """Update client information"""
    client = db.session.get(Client, client_id)
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    schema = ClientSchema()
    
    try:
        data = schema.load(request.json, partial=True)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    for key, value in data.items():
        setattr(client, key, value)
    
    db.session.commit()
    
    log_audit('client_updated', 'client', client.id, {'name': client.full_name})
    
    return jsonify(client.to_dict()), 200
