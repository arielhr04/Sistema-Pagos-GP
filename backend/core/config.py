import os
from dotenv import load_dotenv

# load environment variables from .env located at project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# SQLAlchemy database URL for SQL Server
DATABASE_URL = os.environ.get("DATABASE_URL")

# other settings can remain in .env and accessed directly when needed
JWT_SECRET = os.environ.get("JWT_SECRET", "super-secret-key-change-in-production")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
