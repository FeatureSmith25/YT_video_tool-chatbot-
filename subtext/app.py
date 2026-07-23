import os
import sys
import uuid
import traceback

from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv

# ==========================================================
# Project Path
# ==========================================================

BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..")
)

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# ==========================================================
# Load Environment Variables
# ==========================================================

load_dotenv(os.path.join(BASE_DIR, ".env"))

# ==========================================================
# Import RAG Pipeline
# ==========================================================

from endpoint.rag_pipeline import (
    extract_video_id,
    build_pipeline,
)

# ==========================================================
# Flask App
# ==========================================================

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static"),
    static_url_path="/static"
)

# ==========================================================
# Debug Information
# ==========================================================

print("=" * 60)
print("BASE DIR      :", BASE_DIR)
print("ROOT PATH     :", app.root_path)
print("STATIC FOLDER :", app.static_folder)
print("TEMPLATE PATH :", app.template_folder)
print("URL MAP       :", app.url_map)
print("=" * 60)

# ==========================================================
# Session Storage
# ==========================================================

SESSIONS = {}

# ==========================================================
# Home
# ==========================================================

@app.route("/")
def home():
    return render_template("index.html")


# ==========================================================
# CSS Test
# ==========================================================

@app.route("/test-css")
def test_css():
    return app.send_static_file("style.css")


# ==========================================================
# Health
# ==========================================================

@app.route("/health")
def health():
    return jsonify(
        {
            "status": "ok"
        }
    )


# ==========================================================
# Process Video
# ==========================================================

@app.route("/api/process", methods=["POST"])
def process_video():

    try:

        data = request.get_json(force=True)

        raw_input = data.get("video_input", "").strip()

        language = data.get("language", "en")

        chunk_size = int(
            data.get("chunk_size", 1000)
        )

        chunk_overlap = int(
            data.get("chunk_overlap", 100)
        )

        k = int(
            data.get("k", 2)
        )

        if raw_input == "":
            return jsonify(
                {
                    "error": "Please enter a YouTube URL."
                }
            ), 400

        video_id = extract_video_id(raw_input)

        chain, n_chunks = build_pipeline(
            video_id=video_id,
            language=language,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            k=k,
        )

        session_id = str(uuid.uuid4())

        SESSIONS[session_id] = {
            "chain": chain,
            "video_id": video_id,
            "chunks": n_chunks,
        }

        thumbnail = (
            f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg"
        )

        return jsonify(
            {
                "session_id": session_id,
                "video_id": video_id,
                "thumbnail": thumbnail,
                "n_chunks": n_chunks,
            }
        )

    except Exception as e:

        traceback.print_exc()

        return jsonify(
            {
                "error": str(e)
            }
        ), 500
    # ==========================================================
# Ask Question
# ==========================================================

@app.route("/api/ask", methods=["POST"])
def ask_question():

    try:

        data = request.get_json(force=True)

        session_id = data.get("session_id")
        question = data.get("question", "").strip()

        if not session_id:
            return jsonify(
                {
                    "error": "Session ID is missing."
                }
            ), 400

        if session_id not in SESSIONS:
            return jsonify(
                {
                    "error": "Invalid session."
                }
            ), 404

        if question == "":
            return jsonify(
                {
                    "error": "Question cannot be empty."
                }
            ), 400

        chain = SESSIONS[session_id]["chain"]

        answer = chain.invoke(question)

        return jsonify(
            {
                "answer": answer
            }
        )

    except Exception as e:

        traceback.print_exc()

        return jsonify(
            {
                "error": str(e)
            }
        ), 500


# ==========================================================
# Reset Session
# ==========================================================

@app.route("/api/reset", methods=["POST"])
def reset_session():

    try:

        data = request.get_json(force=True)

        session_id = data.get("session_id")

        if session_id in SESSIONS:
            del SESSIONS[session_id]

        return jsonify(
            {
                "status": "success"
            }
        )

    except Exception as e:

        traceback.print_exc()

        return jsonify(
            {
                "error": str(e)
            }
        ), 500


# ==========================================================
# Error Handlers
# ==========================================================

@app.errorhandler(404)
def page_not_found(e):

    # IMPORTANT:
    # Let Flask serve static files normally.
    if request.path.startswith("/static/"):
        return e

    return jsonify(
        {
            "error": "Route not found."
        }
    ), 404


@app.errorhandler(Exception)
def handle_exception(e):

    traceback.print_exc()

    return jsonify(
        {
            "error": str(e)
        }
    ), 500


# ==========================================================
# Main
# ==========================================================

if __name__ == "__main__":

    print("=" * 60)
    print("Flask Server Started")
    print("Open Browser:")
    print("http://127.0.0.1:5000")
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )