# Online Deployment Guide

To deploy Sea Distances to a live online environment (e.g. Render, Railway, DigitalOcean, AWS), the application has been fully containerized using Docker.

Because Sea Distances runs a Python FastAPI backend and a static HTML/JS frontend, the ideal and easiest way to run the entire project is as a single combined container where Uvicorn serves both the API endpoints and the static frontend files.

## 1. Using Docker (Recommended)
This repository now contains a `Dockerfile`. Any modern cloud provider that supports "deploying from a Dockerfile" can host this instantly.

1. Create a GitHub repository and push this entire project to it.
2. Sign up for a service like [Render.com](https://render.com) or [Railway.app](https://railway.app).
3. Create a new "Web Service".
4. Link it to your GitHub repository.
5. The cloud provider will automatically detect the `Dockerfile`, build the Python environment, install all dependencies (including `searoute`), and launch the app.
6. The service runs on Port `8000`.

## 2. Running Locally with Docker Compose
If you want to test the deployment container on your own Mac or another machine before publishing it to the cloud:
1. Ensure you have Docker Desktop installed.
2. Open the terminal in the root folder of the project.
3. Run: `docker-compose up --build`
4. Access the web interface at `http://localhost:8000`

## 3. Important Note
We moved the `searoute-1.4.3` library's core folder directly inside the `backend/` directory. This is critical for cloud deployments, because it guarantees the cloud Linux server has the library file relative to the execution environment, breaking the dependency on your local `/Volumes/SSD MAC...` absolute path.
