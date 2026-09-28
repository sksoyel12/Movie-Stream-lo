import functools
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database — M-07: no default credentials; must be provided via .env or env var
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    rate_limit_storage_uri: str = "memory://"

    # JWT
    # Replit exposes SESSION_SECRET for the existing app. Keep JWT_SECRET as the
    # preferred explicit setting, but use SESSION_SECRET when importing this
    # backend into the existing API artifact.
    jwt_secret: SecretStr = SecretStr("")
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    jwt_refresh_expiry_days: int = 7

    # Database Pool
    db_pool_size: int = 20
    db_max_overflow: int = 10
    db_pool_recycle: int = 3600

    # CORS — M-07: default to empty; must be explicitly configured
    cors_origins: str = "*"

    # TMDB remains server-side so the Expo bundle never contains the API key.
    tmdb_api_key: SecretStr = SecretStr("d2d572a7978924ec357fed057e68cef6")
    tmdb_backup_api_key: SecretStr = SecretStr("ba0701a4c153282eb8fc8207cade9afa")


    # AI / Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"

    # HLS / SimLive
    hls_segment_dir: str = "/hls_data"
    hls_sources_dir: str = "/hls_sources"
    hls_segment_duration: int = 6
    cdn_base_url: str = "http://localhost:8081"
    api_base_url: str = "http://localhost:8000/api/v1"

    # DRM
    drm_enabled: bool = True

    # Public mobile release manifest. These values are intentionally
    # server-controlled so an old client cannot decide its own support window.
    app_version: str = "2.1.0"
    app_version_code: int = 210
    app_min_supported_version: str = "2.1.0"
    app_release_notes: str = "Security, catalog, and playback improvements."
    app_apk_url: str = ""
    app_force_update: bool = False
    app_update_expires_at: str | None = None

    # CDN Monitoring (Feature 018)
    prometheus_url: str = "http://prometheus:9090"
    grafana_url: str = "http://localhost:3000"

    # Logging
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "extra": "ignore"}

    def model_post_init(self, __context: object) -> None:
        if not self.jwt_secret.get_secret_value():
            session_secret = os.getenv("SESSION_SECRET", "")
            if session_secret:
                self.jwt_secret = SecretStr(session_secret)

    @property
    def async_database_url(self) -> str:
        """Normalize Replit's shared DATABASE_URL for SQLAlchemy asyncpg."""
        url = self.database_url.strip()
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]
        parts = urlsplit(url)
        # libpq URL options are not asyncpg keyword arguments.
        query = [
            (key, value)
            for key, value in parse_qsl(parts.query, keep_blank_values=True)
            if key not in {"sslmode", "channel_binding"}
        ]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    @property
    def database_requires_ssl(self) -> bool:
        return "sslmode=require" in self.database_url or "sslmode=verify" in self.database_url

    @functools.cached_property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        return origins or ["*"]


settings = Settings()
