# app/routes/biometric.py
import base64
import json
import secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
)
from webauthn.helpers.structs import RegistrationCredential
from webauthn.helpers.cose import COSEAlgorithmIdentifier
from app import db
from app.models import User

biometric_bp = Blueprint("biometric", __name__, url_prefix="/api/auth/biometric")

# ---------- Helper Functions ----------
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)

# ---------- FIX 1: Use Config for RP ID ----------
def _rp_id() -> str:
    """Return the effective RP ID from config (no port, no www)."""
    return current_app.config.get("WEBAUTHN_RP_ID", "localhost")

def _origin() -> str:
    """Return the frontend origin from the request's Origin header."""
    origin = request.headers.get("Origin")
    allowed = current_app.config.get("CORS_ORIGINS", [])
    if origin and (origin in allowed or "*" in allowed):
        return origin
    # Fallback to configured frontend URL (safer than guessing)
    return current_app.config.get("FRONTEND_URL", "http://localhost:5173")

# ---------- FIX 2: Persistent Challenge Storage (DB) ----------
# Add this model (if not already present) – or reuse Redis
from app.models import WebauthnChallenge

def store_challenge(user_id: int, challenge: bytes) -> str:
    token = secrets.token_urlsafe(32)
    challenge_b64 = _b64url(challenge)
    exp = datetime.utcnow() + timedelta(minutes=5)
    WebauthnChallenge.query.filter_by(user_id=user_id).delete()  # keep only latest
    db.session.add(WebauthnChallenge(
        token=token,
        user_id=user_id,
        challenge=challenge_b64,
        expires_at=exp
    ))
    db.session.commit()
    return token

def get_and_delete_challenge(token: str):
    record = WebauthnChallenge.query.filter_by(token=token).first()
    if not record or record.expires_at < datetime.utcnow():
        return None
    challenge_bytes = _b64url_decode(record.challenge)
    db.session.delete(record)
    db.session.commit()
    return challenge_bytes

# ---------- Registration ----------
@biometric_bp.route("/register/begin", methods=["POST"])
@jwt_required()
def register_begin():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name="Nagolie Enterprises",
        user_id=str(user.id).encode(),
        user_name=user.username,
        user_display_name=user.username,
        authenticator_selection=AuthenticatorSelectionCriteria(
            # FIX 4: Allow any authenticator (no strict user verification)
            user_verification=UserVerificationRequirement.PREFERRED,
            resident_key="preferred",
        ),
        supported_pub_key_algs=[
            COSEAlgorithmIdentifier.ECDSA_SHA_256,
            COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
        ],
    )

    cache_key = store_challenge(user_id, options.challenge)

    payload = {
        "cacheKey": cache_key,
        "options": {
            "challenge": _b64url(options.challenge),
            "rp": {"id": options.rp.id, "name": options.rp.name},
            "user": {
                "id": _b64url(options.user.id),
                "name": options.user.name,
                "displayName": options.user.display_name,
            },
            "pubKeyCredParams": [
                {"alg": -7, "type": "public-key"},
                {"alg": -257, "type": "public-key"},
            ],
            "authenticatorSelection": {
                "userVerification": "preferred",
                "residentKey": "preferred",
            },
            "timeout": 60000,
            "attestation": "none",
        },
    }
    return jsonify(payload), 200

@biometric_bp.route("/register/complete", methods=["POST"])
@jwt_required()
def register_complete():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    body = request.get_json()
    cache_key = body.pop("cacheKey", None)
    if not cache_key:
        return jsonify({"error": "Missing cacheKey"}), 400

    expected_challenge = get_and_delete_challenge(cache_key)
    if not expected_challenge:
        return jsonify({"error": "Challenge expired or not found"}), 400

    from webauthn.helpers.structs import RegistrationCredential
    try:
        # ✅ Use parse_raw (compatible with your library version)
        credential = RegistrationCredential.parse_raw(json.dumps(body))
    except Exception as parse_err:
        current_app.logger.error(f"WebAuthn parse error: {str(parse_err)}", exc_info=True)
        return jsonify({"error": f"Invalid credential format: {str(parse_err)}"}), 400

    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=_rp_id(),
            expected_origin=_origin(),
            require_user_verification=False,
        )

        # Transports are inside response.transports
        transports = body.get("response", {}).get("transports", [])
        user.webauthn_credential_id = _b64url(verification.credential_id)
        user.webauthn_public_key = verification.credential_public_key
        user.webauthn_sign_count = verification.sign_count
        user.webauthn_transports = transports
        db.session.commit()

        return jsonify({"success": True, "credentialId": user.webauthn_credential_id}), 200
    except Exception as e:
        current_app.logger.error(f"WebAuthn verification error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Verification failed: {str(e)}"}), 500
    
# ---------- Authentication ----------
@biometric_bp.route("/login/begin", methods=["POST"])
def login_begin():
    username = request.json.get("username", "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.webauthn_credential_id:
        return jsonify({"error": "No biometric credential found"}), 404

    credential_id_bytes = _b64url_decode(user.webauthn_credential_id)
    options = generate_authentication_options(
        rp_id=_rp_id(),
        allow_credentials=[
            PublicKeyCredentialDescriptor(
                id=credential_id_bytes,
                type="public-key",
                transports=user.webauthn_transports,  # helps browser choose method
            )
        ],
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    cache_key = store_challenge(user.id, options.challenge)

    payload = {
        "cacheKey": cache_key,
        "options": {
            "challenge": _b64url(options.challenge),
            "rpId": _rp_id(),
            "allowCredentials": [
                {
                    "id": user.webauthn_credential_id,
                    "type": "public-key",
                    "transports": user.webauthn_transports,
                }
            ],
            "userVerification": "preferred",
            "timeout": 60000,
        },
    }
    return jsonify(payload), 200

@biometric_bp.route("/login/complete", methods=["POST"])
def login_complete():
    body = request.get_json()
    cache_key = body.pop("cacheKey", None)
    if not cache_key:
        return jsonify({"error": "Missing cacheKey"}), 400

    expected_challenge = get_and_delete_challenge(cache_key)
    if not expected_challenge:
        return jsonify({"error": "Challenge expired"}), 400

    from webauthn.helpers.structs import AuthenticationCredential
    credential = AuthenticationCredential.parse_raw(json.dumps(body))

    # We need the user ID from the cache (store it too)
    # We stored user_id in the challenge record. Retrieve it.
    record = WebauthnChallenge.query.filter_by(token=cache_key).first()
    if not record:
        return jsonify({"error": "Invalid session"}), 400
    user = db.session.get(User, record.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    verification = verify_authentication_response(
        credential=credential,
        expected_challenge=expected_challenge,
        expected_rp_id=_rp_id(),
        expected_origin=_origin(),
        credential_public_key=user.webauthn_public_key,
        credential_current_sign_count=user.webauthn_sign_count,
        require_user_verification=False,
    )

    user.webauthn_sign_count = verification.new_sign_count
    db.session.commit()

    access_token = create_access_token(identity=str(user.id))
    if user.role == "admin":
        redirect_to = "/admin"
    elif user.role == "investor":
        redirect_to = "/investor"
    else:
        redirect_to = "/recovery"

    return jsonify({
        "access_token": access_token,
        "user": user.to_dict(),
        "redirect_to": redirect_to,
    }), 200

# ---------- Disable ----------
@biometric_bp.route("/disable", methods=["DELETE"])
@jwt_required()
def disable_biometrics():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user.webauthn_credential_id = None
    user.webauthn_public_key = None
    user.webauthn_sign_count = 0
    user.webauthn_transports = None
    db.session.commit()
    return jsonify({"success": True}), 200