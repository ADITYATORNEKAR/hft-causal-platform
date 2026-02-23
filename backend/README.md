# High-Frequency Trading Platform Backend

This directory contains the backend implementation of the high-frequency trading platform, built using FastAPI. The backend is responsible for handling API requests, processing data, and serving the frontend application.

## Directory Structure

- **app/api**: Contains FastAPI route definitions for the backend API.
- **app/models**: Holds data models and schemas used in the FastAPI application.
- **app/services**: Includes service classes for business logic and data processing.
- **app/main.py**: The entry point for the FastAPI application, setting up the app instance and including routes.

## Setup

To set up the backend, follow these steps:

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd high-frequency-trading-platform/backend
   ```

2. **Create a virtual environment** (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**:
   ```bash
   uvicorn app.main:app --reload
   ```

## API Documentation

The API documentation can be accessed at `http://localhost:8000/docs` once the application is running. This provides an interactive interface to explore the available endpoints.

## Testing

To run tests, ensure you have the necessary testing libraries installed and execute the test suite.

## Deployment

For deployment, you can use the provided Dockerfile to build a Docker image. Use the following command:

```bash
docker build -t high-frequency-trading-backend .
```

Then run the container:

```bash
docker run -d -p 8000:8000 high-frequency-trading-backend
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.