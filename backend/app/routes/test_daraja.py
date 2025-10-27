# app/routes/test_daraja.py
from flask import Blueprint, jsonify, current_app
from flask_jwt_extended import jwt_required
from app.utils.daraja import DarajaAPI
from app.routes.payments import payments_bp


test_bp = Blueprint('test', __name__)

@test_bp.route('/test-daraja', methods=['GET'])
@jwt_required()
def test_daraja():
    """Test Daraja API connection"""
    try:
        daraja = DarajaAPI()
        access_token = daraja.get_access_token()
        
        if access_token:
            return jsonify({
                'success': True,
                'message': 'Daraja credentials are working!',
                'access_token': access_token[:50] + '...' if access_token else None,
                'environment': current_app.config['DARAJA_ENV'],
                'shortcode': current_app.config['DARAJA_SHORTCODE']
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to get access token. Check your Daraja credentials.'
            }), 400
            
    except Exception as e:
        current_app.logger.error(f"Daraja test error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Daraja test failed: {str(e)}'
        }), 500

@test_bp.route('/test-stk', methods=['POST'])
@jwt_required()
def test_stk_push():
    """Test STK Push with a small amount"""
    try:
        data = current_app.test_client_context or {}
        phone_number = data.get('phone_number', '254708374149')  # Test number
        amount = data.get('amount', 1)  # KSh 1 for testing
        
        daraja = DarajaAPI()
        
        result = daraja.stk_push(
            phone_number=phone_number,
            amount=amount,
            account_reference='TEST123',
            callback_url=current_app.config['DARAJA_CALLBACK_URL']
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'STK Push test successful!',
                'customer_message': result.get('customer_message'),
                'checkout_request_id': result.get('checkout_request_id')
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'STK Push test failed'),
                'details': result
            }), 400
            
    except Exception as e:
        current_app.logger.error(f"STK test error: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'STK test failed: {str(e)}'
        }), 500

@test_bp.route('/config', methods=['GET'])
@jwt_required()
def get_daraja_config():
    """Get Daraja configuration (without sensitive data)"""
    return jsonify({
        'environment': current_app.config['DARAJA_ENV'],
        'shortcode': current_app.config['DARAJA_SHORTCODE'],
        'callback_url': current_app.config['DARAJA_CALLBACK_URL'],
        'consumer_key_set': bool(current_app.config['DARAJA_CONSUMER_KEY']),
        'consumer_secret_set': bool(current_app.config['DARAJA_CONSUMER_SECRET']),
        'passkey_set': bool(current_app.config['DARAJA_PASSKEY'])
    })


# Add this to your test_daraja.py or create a new route
@payments_bp.route('/test-daraja-setup', methods=['GET'])
@jwt_required()
def test_daraja_setup():
    """Test Daraja API setup"""
    try:
        daraja = DarajaAPI()
        
        # Test access token
        token = daraja.get_access_token()
        if not token:
            return jsonify({
                'success': False,
                'error': 'Failed to get access token'
            }), 500
            
        return jsonify({
            'success': True,
            'message': 'Daraja setup is working',
            'access_token_obtained': True,
            'shortcode': daraja.shortcode
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500