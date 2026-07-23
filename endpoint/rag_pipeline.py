import os
import re
from dotenv import load_dotenv

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
)

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_mistralai import ChatMistralAI

from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import (
    RunnableLambda,
    RunnableParallel,
    RunnablePassthrough,
)

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")

_embedding_cache = None


# -------------------------------------------------
# Embedding Model
# -------------------------------------------------

def get_embeddings():
    global _embedding_cache

    if _embedding_cache is None:
        _embedding_cache = HuggingFaceEmbeddings(
            model_name="BAAI/bge-small-en-v1.5"
        )

    return _embedding_cache


# -------------------------------------------------
# Extract Video ID
# -------------------------------------------------

def extract_video_id(url_or_id: str):

    url_or_id = url_or_id.strip()

    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11})",
        r"^([0-9A-Za-z_-]{11})$",
    ]

    for pattern in patterns:
        match = re.search(pattern, url_or_id)

        if match:
            return match.group(1)

    raise RuntimeError("Invalid YouTube URL")


# -------------------------------------------------
# Transcript
# -------------------------------------------------

def fetch_transcript(video_id, language="en"):

    ytt = YouTubeTranscriptApi()

    try:

        transcript = ytt.fetch(
            video_id,
            languages=[language]
        )

    except TranscriptsDisabled:
        raise RuntimeError(
            "Transcript is disabled for this video."
        )

    except NoTranscriptFound:
        raise RuntimeError(
            "Transcript not found."
        )

    except Exception as e:
        raise RuntimeError(str(e))

    text = " ".join(
        chunk.text
        for chunk in transcript
    )

    if not text.strip():
        raise RuntimeError(
            "Transcript is empty."
        )

    return text


# -------------------------------------------------
# Build Pipeline
# -------------------------------------------------

def build_pipeline(
    video_id,
    language="en",
    chunk_size=1000,
    chunk_overlap=100,
    k=3,
):

    transcript = fetch_transcript(
        video_id,
        language
    )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    chunks = splitter.split_text(
        transcript
    )

    embeddings = get_embeddings()

    vector_store = FAISS.from_texts(
        chunks,
        embedding=embeddings,
    )

    retriever = vector_store.as_retriever(
        search_kwargs={
            "k": k
        }
    )

    llm = ChatMistralAI(
        api_key=MISTRAL_API_KEY,
        model="mistral-small-2506",
        temperature=0.2,
    )

    prompt = PromptTemplate.from_template(
        """
You are a helpful AI assistant.

Answer ONLY using the transcript context.

If the answer is not available inside the transcript simply reply:

"I don't know based on the provided transcript."

Transcript:

{context}

Question:

{question}

Answer:
"""
    )

    def format_docs(docs):

        return "\n\n".join(
            doc.page_content
            for doc in docs
        )

    chain = (
        RunnableParallel(
            {
                "context": retriever
                | RunnableLambda(format_docs),

                "question": RunnablePassthrough(),
            }
        )
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain, len(chunks)