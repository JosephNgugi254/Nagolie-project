from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from webauthn import generate_registration_options, verify_registration_response
from webauthn import generate_authentication_options, verify_authentication_response
from webauthn.helpers.structs import (
    RegistrationCredential, AuthenticationCredential,
    AuthenticatorSelectionCriteria, UserVerificationRequirement
)
import base64
import json
from app import db
from app.models import User

biometric_bp = Blueprint('biometric', __name__, url_prefix='/api/auth/biometric')

@biometric_bp.route('/register/begin', methods=['POST'])
@jwt_required()
def register_begin():
    """Generate registration options for a logged-in user to enroll biometrics."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Prepare user verification (require user presence)
    options = generate_registration_options(
        rp_id=request.host.split(':')[0],  # domain name without port
        rp_name="Nagolie Enterprises",
        user_id=str(user.id).encode(),
        user_name=user.username,
        user_display_name=user.username,
        authenticator_selection=AuthenticatorSelectionCriteria(
            user_verification=UserVerificationRequirement.REQUIRED
        )
    )

    # Store challenge in session (or temporary storage) for later verification
    session = {}  # In production use Flask session or Redis
    session['registration_challenge'] = options.challenge

    return jsonify({
        'options': {
            'challenge': options.challenge,
            'rp': {'id': options.rp.id, 'name': options.rp.name},
            'user': {
                'id': options.user.id,
                'name': options.user.name,
                'displayName': options.user.display_name
            },
            'pubKeyCredParams': [{'alg': -7, 'type': 'public-key'}, {'alg': -257, 'type': 'public-key'}],
            'authenticatorSelection': {'userVerification': 'required'},
            'timeout': options.timeout,
            'attestation': options.attestation
        }
    }), 200

@biometric_bp.route('/register/complete', methods=['POST'])
@jwt_required()
def register_complete():
    """Verify and store the credential after user approves biometric enrollment."""
    user_id = get_jwt_identity()
    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.json
    credential = RegistrationCredential.parse_raw(json.dumps(data))

    # Retrieve challenge from session
    expected_challenge = session.get('registration_challenge')
    if not expected_challenge:
        return jsonify({'error': 'No registration in progress'}), 400

    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=request.host.split(':')[0],
            expected_origin=f"https://{request.host}" if request.is_secure else f"http://{request.host}",
            require_user_verification=True
        )
    except Exception as e:
        return jsonify({'error': f'Verification failed: {str(e)}'}), 400

    # Store credential
    user.webauthn_credential_id = base64.b64encode(verification.credential_id).decode()
    user.webauthn_public_key = verification.credential_public_key
    user.webauthn_sign_count = verification.sign_count
    db.session.commit()

    return jsonify({'success': True, 'message': 'Biometric registered successfully'}), 200

@biometric_bp.route('/login/begin', methods=['POST'])
def login_begin():
    """Generate authentication options for a given username."""
    username = request.json.get('username')
    if not username:
        return jsonify({'error': 'Username required'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.webauthn_credential_id:
        return jsonify({'error': 'User does not have biometrics enabled'}), 404

    # Decode stored credential ID
    credential_id = base64.b64decode(user.webauthn_credential_id)

    options = generate_authentication_options(
        rp_id=request.host.split(':')[0],
        allow_credentials=[{'id': credential_id, 'type': 'public-key'}],
        user_verification=UserVerificationRequirement.REQUIRED
    )

    # Store challenge and user id for later verification
    session['auth_challenge'] = options.challenge
    session['auth_user_id'] = user.id

    return jsonify({
        'options': {
            'challenge': options.challenge,
            'rpId': options.rp_id,
            'allowCredentials': [{'id': base64.b64encode(c['id']).decode(), 'type': c['type']} for c in options.allow_credentials],
            'userVerification': options.user_verification,
            'timeout': options.timeout
        }
    }), 200

@biometric_bp.route('/login/complete', methods=['POST'])
def login_complete():
    """Verify the biometric assertion and return a JWT token."""
    data = request.json
    credential = AuthenticationCredential.parse_raw(json.dumps(data))

    expected_challenge = session.get('auth_challenge')
    user_id = session.get('auth_user_id')
    if not expected_challenge or not user_id:
        return jsonify({'error': 'No authentication in progress'}), 400

    user = db.session.get(User, int(user_id))
    if not user:
        return jsonify({'error': 'User not found'}), 404

    credential_id = base64.b64decode(user.webauthn_credential_id)

    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=request.host.split(':')[0],
            expected_origin=f"https://{request.host}" if request.is_secure else f"http://{request.host}",
            credential_public_key=user.webauthn_public_key,
            credential_current_sign_count=user.webauthn_sign_count,
            require_user_verification=True
        )
    except Exception as e:
        return jsonify({'error': f'Authentication failed: {str(e)}'}), 401

    # Update sign count
    user.webauthn_sign_count = verification.new_sign_count
    db.session.commit()

    # Create JWT token
    access_token = create_access_token(identity=str(user.id))
    user_data = user.to_dict()

    # Determine redirect based on role
    if user.role == 'admin':
        redirect_to = '/admin'
    elif user.role == 'investor':
        redirect_to = '/investor'
    else:
        redirect_to = '/recovery'

    return jsonify({
        'access_token': access_token,
        'user': user_data,
        'redirect_to': redirect_to
    }), 200