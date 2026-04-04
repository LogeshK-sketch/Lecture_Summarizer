"""
firestore_client.py – Firebase Admin SDK wrapper for Firestore operations.
Supports credentials from file (local dev) or JSON env var (production).
"""
import os
import json
from datetime import datetime, timezone
import firebase_admin
from firebase_admin import credentials, firestore, auth

SERVICE_ACCOUNT_PATH = os.path.join(
    os.path.dirname(__file__), "serviceAccountKey.json"
)

# Initialize Firebase Admin SDK once
if not firebase_admin._apps:
    # Priority 1: env var with JSON string (for production / Render)
    creds_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if creds_json:
        try:
            creds_dict = json.loads(creds_json)
            cred = credentials.Certificate(creds_dict)
            firebase_admin.initialize_app(cred)
            print("[Firestore] Firebase Admin SDK initialized from environment variable.")
        except Exception as e:
            print(f"[Firestore] ERROR: Failed to parse FIREBASE_CREDENTIALS_JSON: {e}")

    # Priority 2: local service account file (for local dev)
    elif os.path.exists(SERVICE_ACCOUNT_PATH):
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)
        print("[Firestore] Firebase Admin SDK initialized with service account file.")

    else:
        print(
            "[Firestore] WARNING: No Firebase credentials found! "
            "Set FIREBASE_CREDENTIALS_JSON env var or provide serviceAccountKey.json."
        )

_db = None


def _get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def verify_id_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token and return the decoded token payload.
    Raises firebase_admin.auth.InvalidIdTokenError on failure.
    """
    decoded = auth.verify_id_token(id_token)
    return decoded


# ---------------------------------------------------------------------------
# Firestore CRUD
# ---------------------------------------------------------------------------

def save_record(
    user_uid: str,
    user_email: str,
    transcript: str,
    summary: str,
    source_type: str,   # 'file' | 'text' | 'url' | 'document'
    source_name: str = "",
    summary_length: str = "medium",
    key_points: list = None,
    chart_data: dict = None,
) -> str:
    """
    Save a transcription/summarization record to Firestore.

    Returns:
        The Firestore document ID of the saved record.
    """
    db = _get_db()
    doc_ref = db.collection("records").document()
    doc_data = {
        "uid": user_uid,
        "email": user_email,
        "transcript": transcript,
        "summary": summary,
        "source_type": source_type,
        "source_name": source_name,
        "summary_length": summary_length,
        "key_points": key_points or [],
        "chart_data": chart_data or {},
        "created_at": datetime.now(timezone.utc),
    }
    doc_ref.set(doc_data)
    print(f"[Firestore] Saved record: {doc_ref.id}")
    return doc_ref.id


def get_user_records(user_uid: str) -> list:
    """
    Retrieve all records for a given user UID, ordered newest first.

    Returns:
        List of record dicts (with 'id' field added).
    """
    db = _get_db()
    docs = (
        db.collection("records")
        .where("uid", "==", user_uid)
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .stream()
    )
    records = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        # Convert Firestore timestamp to ISO string
        if "created_at" in data and hasattr(data["created_at"], "isoformat"):
            data["created_at"] = data["created_at"].isoformat()
        records.append(data)
    return records


def delete_record(record_id: str, user_uid: str) -> bool:
    """
    Delete a record if it belongs to the requesting user.

    Returns:
        True if deleted, False if not found or unauthorized.
    """
    db = _get_db()
    doc_ref = db.collection("records").document(record_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False
    if doc.to_dict().get("uid") != user_uid:
        return False
    doc_ref.delete()
    return True
