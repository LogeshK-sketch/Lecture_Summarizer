"""
app.py – Main Flask API server for Lecture Summarizer
"""
import os
import tempfile
import re
import json
from collections import Counter
from functools import wraps
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

from flask import Flask, request, jsonify, send_from_directory, send_file
import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet
from flask_cors import CORS

from transcriber import transcribe_file, transcribe_youtube, transcribe_text_passthrough
from summarizer import summarize_text
from firestore_client import verify_id_token, save_record, get_user_records, delete_record
from doc_extractor import extract_text_from_file

# ─── App Setup ───────────────────────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

nim_client = None
if os.getenv("NVIDIA_API_KEY"):
    nim_client = OpenAI(
      base_url="https://integrate.api.nvidia.com/v1",
      api_key=os.getenv("NVIDIA_API_KEY")
    )

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

ALLOWED_EXTENSIONS = {
    "mp3", "mp4", "wav", "m4a", "ogg", "webm", "flac", "mpeg", "mpga",
    "pdf", "docx", "pptx"
}

MAX_FILE_SIZE_MB = 200
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_SIZE_MB * 1024 * 1024


# ─── Helpers ─────────────────────────────────────────────────────────────────

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


# ─── Auth Middleware ──────────────────────────────────────────────────────────

def require_auth(f):
    """Decorator: verify Firebase ID token from Authorization header."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header."}), 401
        id_token = auth_header.split("Bearer ")[1].strip()
        try:
            decoded = verify_id_token(id_token)
            request.user = decoded          # expose uid, email, etc.
        except Exception as e:
            return jsonify({"error": f"Invalid token: {str(e)}"}), 401
        return f(*args, **kwargs)
    return decorated


# ─── API Routes ───────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Lecture Summarizer API is running."})


@app.route("/api/transcribe", methods=["POST"])
@require_auth
def api_transcribe():
    """
    Accepts a multipart file OR a JSON body with { url, source_type:'url' }.
    Returns: { transcript }
    """
    source_type = request.form.get("source_type") or (
        request.json.get("source_type") if request.is_json else None
    )
    
    # Grab the model parameter if provided
    model_choice = request.form.get("model", "base")
    if request.is_json:
        model_choice = request.json.get("model", model_choice)

    try:
        # ── 1. Paste Text ──────────────────────────────────────────────────
        if source_type == "text":
            data = request.get_json(force=True)
            raw_text = data.get("text", "").strip()
            if not raw_text:
                return jsonify({"error": "No text provided."}), 400
            transcript = transcribe_text_passthrough(raw_text)
            return jsonify({
                "transcript": transcript, 
                "source_type": "text",
                "language": "en",
                "segments": []
            })

        # ── 2. YouTube / URL ───────────────────────────────────────────────
        if source_type == "url":
            data = request.get_json(force=True)
            url = data.get("url", "").strip()
            if not url:
                return jsonify({"error": "No URL provided."}), 400
            result_dict = transcribe_youtube(url, model_choice)
            return jsonify({
                "transcript": result_dict["text"], 
                "language": result_dict["language"],
                "segments": result_dict["segments"],
                "source_type": "url"
            })

        # ── 3. File Upload ─────────────────────────────────────────────────
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded."}), 400
        uploaded_file = request.files["file"]
        if not uploaded_file.filename:
            return jsonify({"error": "Empty filename."}), 400
        if not allowed_file(uploaded_file.filename):
            return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

        ext = uploaded_file.filename.rsplit(".", 1)[1].lower()
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            uploaded_file.save(tmp.name)
            tmp_path = tmp.name

        try:
            result_dict = transcribe_file(tmp_path, model_choice)
        finally:
            os.unlink(tmp_path)

        return jsonify({
            "transcript": result_dict["text"],
            "language": result_dict.get("language", "unknown"),
            "segments": result_dict.get("segments", []),
            "source_type": "file",
            "filename": uploaded_file.filename,
        })

    except Exception as e:
        print(f"[/api/transcribe] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload-document", methods=["POST"])
@require_auth
def api_upload_document():
    """
    Accepts a PDF, DOCX, or PPTX file.
    Returns: { summary, key_points, transcript, file_name }
    """
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded."}), 400
        uploaded_file = request.files["file"]
        if not uploaded_file.filename:
            return jsonify({"error": "Empty filename."}), 400
        
        ext = uploaded_file.filename.rsplit(".", 1)[1].lower()
        if ext not in ["pdf", "docx", "pptx"]:
            return jsonify({"error": f"Unsupported document format: {ext}"}), 400

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            uploaded_file.save(tmp.name)
            tmp_path = tmp.name

        try:
            transcript = extract_text_from_file(tmp_path)
        finally:
            os.unlink(tmp_path)

        if not transcript:
            return jsonify({"error": "Could not extract text from document."}), 400

        summary_length = request.form.get("summary_length", "medium")
        if summary_length not in ("short", "medium", "long"):
            summary_length = "medium"

        summary_res = summarize_text(transcript, summary_length)
        summary = summary_res.get("summary", "")
        key_points = summary_res.get("key_points", [])

        user_uid = request.user.get("uid", "")
        user_email = request.user.get("email", "")

        save_record(
            user_uid=user_uid,
            user_email=user_email,
            transcript=transcript,
            summary=summary,
            source_type="file",
            source_name=uploaded_file.filename,
            summary_length=summary_length,
            key_points=key_points,
        )

        return jsonify({
            "summary": summary,
            "key_points": key_points,
            "transcript": transcript,
            "file_name": uploaded_file.filename
        })

    except Exception as e:
        print(f"[/api/upload-document] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/summarize", methods=["POST"])
@require_auth
def api_summarize():
    """
    Body: { transcript, summary_length, source_type, source_name }
    Saves record to Firestore and returns { summary, record_id }
    """
    try:
        data = request.get_json(force=True)
        transcript    = data.get("transcript", "").strip()
        summary_length = data.get("summary_length", "medium")
        source_type   = data.get("source_type", "text")
        source_name   = data.get("source_name", "")

        if not transcript:
            return jsonify({"error": "No transcript provided."}), 400
        if summary_length not in ("short", "medium", "long"):
            summary_length = "medium"

        summary_res = summarize_text(transcript, summary_length)
        summary = summary_res.get("summary", "")
        key_points = summary_res.get("key_points", [])

        user_uid   = request.user.get("uid", "")
        user_email = request.user.get("email", "")

        record_id = save_record(
            user_uid=user_uid,
            user_email=user_email,
            transcript=transcript,
            summary=summary,
            source_type=source_type,
            source_name=source_name,
            summary_length=summary_length,
            key_points=key_points,
        )

        return jsonify({"summary": summary, "key_points": key_points, "record_id": record_id})

    except Exception as e:
        print(f"[/api/summarize] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/records", methods=["GET"])
@require_auth
def api_records():
    """Return all records for the authenticated user."""
    try:
        user_uid = request.user.get("uid", "")
        records  = get_user_records(user_uid)
        return jsonify({"records": records})
    except Exception as e:
        print(f"[/api/records] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/records/<record_id>", methods=["DELETE"])
@require_auth
def api_delete_record(record_id):
    """Delete a record by ID (must belong to the authenticated user)."""
    try:
        user_uid = request.user.get("uid", "")
        success  = delete_record(record_id, user_uid)
        if not success:
            return jsonify({"error": "Record not found or unauthorized."}), 404
        return jsonify({"success": True})
    except Exception as e:
        print(f"[/api/records DELETE] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/export/pdf", methods=["POST"])
@require_auth
def export_pdf():
    try:
        data = request.get_json(force=True)
        summary = data.get("summary", "")
        key_points = data.get("key_points", [])

        styles = getSampleStyleSheet()
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        
        story = []
        # Title
        story.append(Paragraph("Lecture Summary", styles['Title']))
        story.append(Spacer(1, 12))
        
        # Summary
        story.append(Paragraph(summary, styles['BodyText']))
        story.append(Spacer(1, 12))
        
        # Key Points Section
        story.append(Paragraph("Key Points", styles['Heading2']))
        story.append(Spacer(1, 12))
        
        # Bullet points
        items = [ListItem(Paragraph(pt, styles['BodyText'])) for pt in key_points]
        story.append(ListFlowable(items, bulletType='bullet'))
        
        doc.build(story)
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name="Lecture_Summary.pdf",
            mimetype="application/pdf"
        )
    except Exception as e:
        print(f"[/api/export/pdf] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/export/text", methods=["POST"])
@require_auth
def export_text():
    try:
        data = request.get_json(force=True)
        summary = data.get("summary", "")
        key_points = data.get("key_points", [])

        # Build text string
        lines = []
        lines.append("Lecture Summary")
        lines.append("")
        lines.append(summary)
        lines.append("")
        lines.append("Key Points:")
        lines.append("")
        for pt in key_points:
            lines.append(f"* {pt}")
        
        text_content = "\n".join(lines)
        buffer = io.BytesIO(text_content.encode('utf-8'))
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name="Lecture_Summary.txt",
            mimetype="text/plain"
        )
    except Exception as e:
        print(f"[/api/export/text] Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/visualize", methods=["POST"])
@require_auth
def api_visualize():
    try:
        data = request.get_json(force=True)
        summary = data.get("summary", "")
        key_points = data.get("key_points", [])

        # Fallback values
        labels = [c[0] for c in Counter([w for w in re.findall(r'\b[a-zA-Z]{3,}\b', summary.lower()) if w not in {"the", "and", "but", "for", "with", "this", "that", "are", "was", "were", "not", "have", "has", "had", "can", "could", "would", "from", "their", "them", "these", "some", "what", "which", "when", "where", "also", "into", "been", "only", "most", "more"}]).most_common(6)]
        values = [c[1] for c in Counter([w for w in re.findall(r'\b[a-zA-Z]{3,}\b', summary.lower()) if w not in {"the", "and", "but", "for", "with", "this", "that", "are", "was", "were", "not", "have", "has", "had", "can", "could", "would", "from", "their", "them", "these", "some", "what", "which", "when", "where", "also", "into", "been", "only", "most", "more"}]).most_common(6)]

        if nim_client and summary:
            try:
                prompt = f"""Analyze the following lecture summary and generate structured visual insights.

Return JSON with:
{{
  "flowchart": "Mermaid flowchart code",
  "mindmap": "Mermaid mindmap code",
  "keywords": {{
    "labels": [],
    "values": []
  }}
}}

Rules:
- Flowchart must show logical progression
- Mindmap must show hierarchy
- Keywords must reflect main concepts
- Output must be valid JSON only

TEXT:
{summary}"""
                completion = nim_client.chat.completions.create(
                  model="meta/llama3-8b-instruct",
                  messages=[{"role":"user","content":prompt}],
                  temperature=0.5,
                  top_p=1,
                  max_tokens=1024,
                )
                
                raw_content = completion.choices[0].message.content.strip()
                if raw_content.startswith("```json"):
                    raw_content = raw_content.split("```json", 1)[1]
                if raw_content.endswith("```"):
                    raw_content = raw_content.rsplit("```", 1)[0]
                
                ai_data = json.loads(raw_content.strip())
                return jsonify({
                    "flowchart": ai_data.get("flowchart", "graph TD\\n  A[Error reading flowchart]"),
                    "mindmap": ai_data.get("mindmap", "mindmap\\n  root((Summary))"),
                    "graph_data": ai_data.get("keywords", {"labels": labels, "values": values})
                })
            except Exception as e:
                print(f"[AI Visualize] Error: {e}")
                # Fall back to heuristic below if AI fails

        # Fallback 1. Flowchart Generation
        sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', summary) if len(s.strip()) > 5] or ["No summary available"]
        flowchart = "graph TD\n"
        for i, sent in enumerate(sentences):
            flowchart += f'  N{i}["{sent[:77]+"..." if len(sent)>80 else sent}"]\n'
            if i > 0: flowchart += f'  N{i-1} --> N{i}\n'
            
        return jsonify({
            "flowchart": flowchart,
            "mindmap": "mindmap\\n  root((Summary fallback))",
            "graph_data": {
                "labels": labels,
                "values": values
            }
        })
    except Exception as e:
        print(f"[/api/visualize] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Serve Frontend ───────────────────────────────────────────────────────────

@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/dashboard")
def serve_dashboard():
    return send_from_directory(FRONTEND_DIR, "dashboard.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)


# ─── Run ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    # Disable debug in production; enable only when DEBUG=1 and not in production
    flask_env = os.environ.get("FLASK_ENV", "development")
    debug = flask_env != "production" and os.environ.get("DEBUG", "1") == "1"
    print(f"[App] Starting Lecture Summarizer on http://0.0.0.0:{port} (env={flask_env})")
    app.run(host="0.0.0.0", port=port, debug=debug)
