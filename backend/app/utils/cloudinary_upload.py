# app/utils/cloudinary_upload.py
"""
Cloudinary upload helpers.

Fixes the production failure:
    cloudinary.exceptions.Error: Unexpected error - MaxRetryError(
        ... Failed to resolve 'api.cloudinary.com' ([Errno -3] Lookup timed out))

The underlying cause is a network / DNS problem in the runtime environment,
NOT a bug in the caller. This module:

  1. Applies a hard timeout on every Cloudinary call, so a hung DNS
     lookup cannot block a Flask worker indefinitely.
  2. Retries transient network / DNS failures with exponential backoff.
  3. Normalises every failure into a `CloudinaryUploadError` so callers
     can catch one exception type instead of five.
  4. Logs warnings on each retry (via `current_app.logger` when available,
     falling back to `print` when called outside an app context).
  5. Fixes the double-folder public_id bug: original code passed
     `public_id=f"{folder}/{uuid}"` AND `folder=folder`, which produced
     `folder/folder/<uuid>` on Cloudinary.
"""

from __future__ import annotations

import time
import uuid

import cloudinary
import cloudinary.uploader

# --- exception types that indicate a *transient* network / DNS problem ----
try:
    from cloudinary.exceptions import Error as CloudinaryError
except Exception:  # pragma: no cover
    CloudinaryError = Exception  # type: ignore[assignment]

try:
    from urllib3.exceptions import (
        MaxRetryError,
        NewConnectionError,
        ConnectTimeoutError,
        ReadTimeoutError,
        TimeoutError as Urllib3TimeoutError,
    )
except Exception:  # pragma: no cover
    MaxRetryError = NewConnectionError = ConnectTimeoutError = object  # type: ignore
    ReadTimeoutError = Urllib3TimeoutError = object  # type: ignore

try:
    from requests.exceptions import (
        ConnectionError as RequestsConnectionError,
        Timeout as RequestsTimeout,
    )
except Exception:  # pragma: no cover
    RequestsConnectionError = RequestsTimeout = object  # type: ignore


class CloudinaryUploadError(RuntimeError):
    """Raised when an upload fails after all retry attempts."""


# Tuple of exceptions that mean "try again".
# OSError covers "[Errno -3] Lookup timed out" and
# "[Errno -2] Name or service not known" on every platform we ship on.
_TRANSIENT_EXCEPTIONS = tuple(
    e for e in (
        MaxRetryError,
        NewConnectionError,
        ConnectTimeoutError,
        ReadTimeoutError,
        Urllib3TimeoutError,
        RequestsConnectionError,
        RequestsTimeout,
        CloudinaryError,
        OSError,
        TimeoutError,
    ) if isinstance(e, type)
)


def _log(level: str, message: str) -> None:
    """Log through Flask's app logger if we're inside an app context,
    otherwise fall back to print so scripts/tests still see the message."""
    try:
        from flask import current_app
        getattr(current_app.logger, level)(message)
    except Exception:
        print(message)


def upload_base64_image(
    base64_string: str,
    folder: str = "livestock",
    *,
    timeout: int = 15,
    attempts: int = 3,
    backoff: float = 1.5,
):
    """
    Upload a base64 image to Cloudinary and return the secure URL.

    Parameters
    ----------
    base64_string : str
        Either a raw base64 payload or a full data URL
        (``data:image/png;base64,...``).
    folder : str
        Cloudinary folder to organise uploads into
        (e.g. ``'livestock'``, ``'loan_applications'``).
    timeout : int
        Per-attempt timeout in seconds. Prevents a stuck DNS lookup
        from hanging a worker forever.
    attempts : int
        Total number of tries (1 = no retries).
    backoff : float
        Exponential backoff base: sleep ``backoff ** (n-1)`` between
        attempts. With ``backoff=1.5`` and 3 attempts you sleep
        1.0s then 1.5s.

    Raises
    ------
    CloudinaryUploadError
        When every attempt fails. The original exception is chained on
        ``__cause__`` so you can still inspect it in logs.

    Returns
    -------
    str | None
        The ``secure_url`` from Cloudinary (``None`` only if Cloudinary
        returned a response without one — which we treat as a failure).
    """
    if not base64_string:
        raise CloudinaryUploadError(
            "upload_base64_image called with empty payload"
        )

    # Strip a data URL prefix if present. We re-add one below so Cloudinary
    # can sniff the mime type; if the caller already sent a full data URL
    # we keep it as-is.
    if "base64," in base64_string:
        payload = base64_string.split("base64,", 1)[1]
    else:
        payload = base64_string

    # Unique public_id avoids collisions when the same image is uploaded
    # twice in quick succession. NOTE: do NOT prefix with `folder` — we
    # already pass `folder=folder` below, and Cloudinary concatenates them.
    public_id = str(uuid.uuid4())

    last_exc = None

    for attempt in range(1, attempts + 1):
        try:
            upload_result = cloudinary.uploader.upload(
                f"data:image/png;base64,{payload}",
                public_id=public_id,
                folder=folder,
                resource_type="image",
                timeout=timeout,
            )
            secure_url = upload_result.get("secure_url")
            if not secure_url:
                raise CloudinaryUploadError(
                    f"Cloudinary returned no secure_url: {upload_result!r}"
                )
            return secure_url

        except _TRANSIENT_EXCEPTIONS as exc:
            last_exc = exc
            _log(
                "warning",
                f"[cloudinary] upload attempt {attempt}/{attempts} "
                f"failed for folder={folder!r}: {exc!r}",
            )
            if attempt < attempts:
                time.sleep(backoff ** (attempt - 1))

        except Exception as exc:
            # Anything else (bad input, auth error, quota) — don't retry,
            # don't mask the real problem.
            _log(
                "error",
                f"[cloudinary] non-retryable upload failure "
                f"for folder={folder!r}: {exc!r}",
            )
            raise CloudinaryUploadError(str(exc)) from exc

    # All attempts exhausted.
    raise CloudinaryUploadError(
        f"Cloudinary upload failed after {attempts} attempts: {last_exc!r}"
    ) from last_exc


def delete_image(public_id: str) -> dict:
    """Delete an image from Cloudinary by its public_id."""
    try:
        return cloudinary.uploader.destroy(public_id)
    except Exception as exc:
        _log("error", f"[cloudinary] delete error for {public_id!r}: {exc!r}")
        raise