# AR-LOKAL ai-service: validation + TripoSR reconstruction.
# PyPI torch wheels for Linux include CUDA; with the NVIDIA Container Toolkit and
# the GPU block in docker-compose.yml the same image uses the GPU (docs/HARDWARE.md).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app
WORKDIR /app

COPY requirements.txt requirements-models.txt requirements-reconstruction.txt ./
RUN pip install -r requirements.txt -r requirements-models.txt -r requirements-reconstruction.txt

COPY ai_service ./ai_service
COPY config ./config
COPY third_party ./third_party
COPY scripts ./scripts
RUN mkdir -p models && chown -R app:app /app
USER app

# Weights are mounted at /app/models (docker-compose) or fetched with
#   python -I scripts/download_models.py
EXPOSE 8000
CMD ["uvicorn", "ai_service.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
