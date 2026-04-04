"""
transcriber.py – Audio/video transcription using Groq Whisper API
             – YouTube audio extraction using yt-dlp
"""
import os
import shutil
import tempfile
from groq import Groq

# ─── Groq Client Setup ────────────────────────────────────────────────────────

_groq_client = None

def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY environment variable not set. "
                "Get a free key at https://console.groq.com"
            )
        _groq_client = Groq(api_key=api_key)
    return _groq_client


# ─── FFmpeg helper (still needed for yt-dlp audio extraction) ─────────────────

def ensure_ffmpeg_available():
    ffmpeg_path = shutil.which('ffmpeg')
    if not ffmpeg_path:
        try:
            import imageio_ffmpeg
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            d = os.path.dirname(ffmpeg_path)
            exe_name = 'ffmpeg.exe' if os.name == 'nt' else 'ffmpeg'
            if not os.path.exists(os.path.join(d, exe_name)):
                shutil.copy(ffmpeg_path, os.path.join(d, exe_name))
            os.environ["PATH"] += os.pathsep + d
            ffmpeg_path = shutil.which('ffmpeg')
        except ImportError:
            pass

    if not ffmpeg_path:
        raise RuntimeError(
            'ffmpeg is required for audio extraction but was not found on PATH. '
            'Install ffmpeg and add it to your system PATH, then restart the app.'
        )
    return ffmpeg_path


# ─── Transcription via Groq Whisper API ───────────────────────────────────────

def transcribe_file(file_path: str, model_size: str = "base") -> dict:
    """
    Transcribe an audio/video file using Groq Whisper API.

    Args:
        file_path: Absolute path to the audio/video file.
        model_size: Ignored (Groq uses whisper-large-v3 which is always best quality).

    Returns:
        Dict containing transcript text, language detected, and segments.
    """
    print(f"[Transcriber] Transcribing file via Groq API: {file_path}")
    client = _get_groq_client()

    with open(file_path, "rb") as audio_file:
        transcription = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=audio_file,
            response_format="verbose_json",
        )

    return {
        "text": transcription.text.strip(),
        "language": getattr(transcription, "language", "unknown"),
        "segments": getattr(transcription, "segments", [])
    }


def transcribe_youtube(url: str, model_size: str = "base") -> dict:
    """
    Download audio from YouTube and transcribe via Groq Whisper API.
    """
    import yt_dlp

    with tempfile.TemporaryDirectory() as tmpdir:
        output_template = os.path.join(tmpdir, "audio.%(ext)s")

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": False,
            "noplaylist": True,
            "geo_bypass": True,
            "retries": 3,
            "http_headers": {"User-Agent": "Mozilla/5.0"},
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "128",
                }
            ],
        }

        # Use cookies file if it exists locally (optional)
        cookies_path = os.path.join(os.path.dirname(__file__), "cookies.txt")
        if os.path.exists(cookies_path):
            ydl_opts["cookiefile"] = cookies_path

        print(f"[Transcriber] Downloading audio from: {url}")
        ensure_ffmpeg_available()

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find downloaded file
        audio_file = None
        for fname in os.listdir(tmpdir):
            if fname.startswith("audio."):
                audio_file = os.path.join(tmpdir, fname)
                break

        if not audio_file:
            raise FileNotFoundError("Audio file not found after YouTube download.")

        return transcribe_file(audio_file, model_size)


def transcribe_text_passthrough(text: str) -> str:
    """
    When the user pastes text directly, no transcription needed.
    Just return the text as-is.
    """
    return text.strip()
