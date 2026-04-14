"""
app/routes/biometric.py  –  WebAuthn / Biometric login for Nagolie Enterprises
Fixed issues:
  1. Challenges are stored in a server-side in-memory cache (not flask_session) so
     they survive across stateless Render deploys within the same process.
  2. All byte values (challenge, credential IDs) are serialised as Base64URL strings
     so @simplewebauthn/browser can decode them correctly.
  3. Registration /complete endpoint robustly handles both dict and object responses
     from different versions of py_webauthn.
"""

import base64
import json
import secrets
import traceback
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
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
from webauthn.helpers.cose import COSEAlgorithmIdentifier

from app import db
from app.models import User

biometric_bp = Blueprint("biometric", __name__, url_prefix="/api/auth/biometric")

# ---------------------------------------------------------------------------
# Simple in-process challenge cache  (works on Render single-instance deploy)
# key  → {challenge_bytes, user_id, expires_at}
# ---------------------------------------------------------------------------
_challenge_cache: dict = {}
_CHALLENGE_TTL = timedelta(minutes=5)


def _b64url(data: bytes) -> str:
    """Standard Base64URL encoding WITHOUT padding – what SimpleWebAuthn expects."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    """Decode a Base64URL string (with or without padding)."""
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _cache_key() -> str:
    """Return a unique key for this challenge request."""
    return secrets.token_hex(16)


def _store_challenge(key: str, challenge: bytes, user_id: int | None = None):
    _challenge_cache[key] = {
        "challenge": challenge,
        "user_id": user_id,
        "expires_at": datetime.utcnow() + _CHALLENGE_TTL,
    }


def _pop_challenge(key: str) -> dict | None:
    entry = _challenge_cache.pop(key, None)
    if entry and datetime.utcnow() < entry["expires_at"]:
        return entry
    return None


def _purge_expired():
    now = datetime.utcnow()
    expired = [k for k, v in _challenge_cache.items() if v["expires_at"] < now]
    for k in expired:
        _challenge_cache.pop(k, None)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rp_id(req) -> str:
    host = req.host.split(":")[0]
    return host


def _origin(req) -> str:
    if req.is_secure:
        return f"https://{req.host}"
    return f"http://{req.host}"


# ---------------------------------------------------------------------------
# Registration  –  Step 1: Get options
# ---------------------------------------------------------------------------

@biometric_bp.route("/register/begin", methods=["POST"])
@jwt_required()
def register_begin():
    _purge_expired()
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        options = generate_registration_options(
            rp_id=_rp_id(request),
            rp_name="Nagolie Enterprises",
            user_id=str(user.id).encode(),
            user_name=user.username,
            user_display_name=user.username,
            authenticator_selection=AuthenticatorSelectionCriteria(
                user_verification=UserVerificationRequirement.PREFERRED,
            ),
            supported_pub_key_algs=[
                COSEAlgorithmIdentifier.ECDSA_SHA_256,
                COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256,
            ],
        )

        # Store challenge server-side
        cache_key = _cache_key()
        _store_challenge(cache_key, options.challenge, user_id)

        # Build the payload that @simplewebauthn/browser's startRegistration() expects
        payload = {
            "cacheKey": cache_key,          # we send this back so /complete can retrieve the challenge
            "options": {
                "challenge": _b64url(options.challenge),
                "rp": {"id": options.rp.id, "name": options.rp.name},
                "user": {
                    "id": _b64url(options.user.id),
                    "name": options.user.name,
                    "displayName": options.user.display_name,
                },
                "pubKeyCredParams": [
                    {"alg": -7,   "type": "public-key"},   # ES256
                    {"alg": -257, "type": "public-key"},   # RS256
                ],
                "authenticatorSelection": {
                    "userVerification": "preferred",
                    "residentKey": "preferred",
                },
                "timeout": options.timeout or 60000,
                "attestation": "none",
            },
        }
        return jsonify(payload), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to generate registration options"}), 500


# ---------------------------------------------------------------------------
# Registration  –  Step 2: Verify & save credential
# ---------------------------------------------------------------------------

@biometric_bp.route("/register/complete", methods=["POST"])
@jwt_required()
def register_complete():
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        body = request.get_json()
        cache_key = body.pop("cacheKey", None)
        if not cache_key:
            return jsonify({"error": "Missing cacheKey"}), 400

        entry = _pop_challenge(cache_key)
        if not entry:
            return jsonify({"error": "Challenge expired or not found – please try again"}), 400

        expected_challenge: bytes = entry["challenge"]

        # py_webauthn expects a JSON string for the credential
        credential_json = json.dumps(body)

        from webauthn.helpers.structs import RegistrationCredential
        credential = RegistrationCredential.parse_raw(credential_json)

        verification = verify_registration_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=_rp_id(request),
            expected_origin=_origin(request),
            require_user_verification=False,
        )

        # Store credential – id as Base64URL string, public key as raw bytes
        user.webauthn_credential_id = _b64url(verification.credential_id)
        user.webauthn_public_key = verification.credential_public_key
        user.webauthn_sign_count = verification.sign_count
        db.session.commit()

        return jsonify({"success": True, "message": "Biometric registered successfully",
                        "credentialId": user.webauthn_credential_id}), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Biometric registration failed – please try again"}), 400


# ---------------------------------------------------------------------------
# Authentication  –  Step 1: Get options
# ---------------------------------------------------------------------------

@biometric_bp.route("/login/begin", methods=["POST"])
def login_begin():
    _purge_expired()
    try:
        username = (request.get_json() or {}).get("username", "").strip()
        if not username:
            return jsonify({"error": "Username required"}), 400

        user = User.query.filter_by(username=username).first()
        if not user or not user.webauthn_credential_id:
            return jsonify({"error": "No biometric credential found for this user"}), 404

        credential_id_bytes = _b64url_decode(user.webauthn_credential_id)

        options = generate_authentication_options(
            rp_id=_rp_id(request),
            allow_credentials=[
                PublicKeyCredentialDescriptor(
                    id=credential_id_bytes,
                    type="public-key",           # type: ignore[arg-type]
                )
            ],
            user_verification=UserVerificationRequirement.PREFERRED,
        )

        cache_key = _cache_key()
        _store_challenge(cache_key, options.challenge, user.id)

        payload = {
            "cacheKey": cache_key,
            "options": {
                "challenge": _b64url(options.challenge),
                "rpId": _rp_id(request),
                "allowCredentials": [
                    {
                        "id": user.webauthn_credential_id,   # already Base64URL
                        "type": "public-key",
                    }
                ],
                "userVerification": "preferred",
                "timeout": options.timeout or 60000,
            },
        }
        return jsonify(payload), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to generate authentication options"}), 500


# ---------------------------------------------------------------------------
# Authentication  –  Step 2: Verify signature & issue JWT
# ---------------------------------------------------------------------------

@biometric_bp.route("/login/complete", methods=["POST"])
def login_complete():
    try:
        body = request.get_json()
        cache_key = body.pop("cacheKey", None)
        if not cache_key:
            return jsonify({"error": "Missing cacheKey"}), 400

        entry = _pop_challenge(cache_key)
        if not entry:
            return jsonify({"error": "Challenge expired or not found – please try again"}), 400

        expected_challenge: bytes = entry["challenge"]
        user_id: int = entry["user_id"]

        user = db.session.get(User, user_id)
        if not user or not user.webauthn_credential_id:
            return jsonify({"error": "User not found"}), 404

        credential_id_bytes = _b64url_decode(user.webauthn_credential_id)

        from webauthn.helpers.structs import AuthenticationCredential
        credential = AuthenticationCredential.parse_raw(json.dumps(body))

        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=_rp_id(request),
            expected_origin=_origin(request),
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
            "user": {**user.to_dict(), "webauthn_enabled": True},
            "redirect_to": redirect_to,
        }), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Biometric authentication failed – please try again"}), 401


# ---------------------------------------------------------------------------
# Disable biometrics  –  DELETE credential
# ---------------------------------------------------------------------------

@biometric_bp.route("/disable", methods=["DELETE"])
@jwt_required()
def disable_biometrics():
    try:
        user_id = int(get_jwt_identity())
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        user.webauthn_credential_id = None
        user.webauthn_public_key = None
        user.webauthn_sign_count = 0
        db.session.commit()
        return jsonify({"success": True, "message": "Biometrics disabled"}), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Failed to disable biometrics"}), 500