FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set work directory
WORKDIR /app

# Install system dependencies (required for some geoprocessing packages in Shapely/searoute if needed in the future)
RUN apt-get update && apt-get install -y \
    gcc \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies from the backend folder
COPY backend/requirements.txt /app/backend/
RUN pip install --upgrade pip
RUN pip install -r backend/requirements.txt

# Copy the entire project
COPY . /app/

# Expose port 8000 for the FastAPI server
EXPOSE 8000

# Change working directory so local imports and relative file paths work
WORKDIR /app/backend

# Generate precalculated isochrone data for ports during the docker build phase (runs once upon deployment)
RUN python precalc_spain.py

# Run Uvicorn directly serving main.py
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
