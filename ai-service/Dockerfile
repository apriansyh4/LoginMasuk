# AR-LOKAL ai-service. For GPU (TripoSR, Milestone 2) build FROM a CUDA base,
# see docs/HARDWARE.md. This image runs validation on CPU.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
WORKDIR /app

COPY requirements.txt requirements-models.txt ./
RUN pip install -r requirements.txt -r requirements-models.txt

COPY ai_service ./ai_service
COPY config ./config
COPY scripts ./scripts
RUN mkdir -p models && chown -R app:app /app
USER app

# Weights are mounted at /app/models (docker-compose) or fetched with
#   python -I scripts/download_models.py
EXPOSE 8000
CMD ["uvicorn", "ai_service.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
