from collections.abc import AsyncGenerator

from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError, TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings
from app.services.resilience import DATABASE_BREAKER


def _is_transient_database_failure(error: Exception) -> bool:
    if isinstance(error, (OperationalError, InterfaceError, SQLAlchemyTimeoutError)):
        return True
    return isinstance(error, DBAPIError) and error.connection_invalidated


class ResilientAsyncSession(AsyncSession):
    """Fail fast on a down database while retaining ordinary SQL errors."""

    async def execute(self, statement, *args, **kwargs):
        operation = super().execute(statement, *args, **kwargs)
        return await DATABASE_BREAKER.call(
            lambda: operation,
            failure_filter=_is_transient_database_failure,
        )

    async def get(self, entity, ident, **kwargs):
        operation = super().get(entity, ident, **kwargs)
        return await DATABASE_BREAKER.call(
            lambda: operation,
            failure_filter=_is_transient_database_failure,
        )

    async def commit(self):
        operation = super().commit()
        return await DATABASE_BREAKER.call(
            lambda: operation,
            failure_filter=_is_transient_database_failure,
        )

    async def flush(self, objects=None):
        operation = super().flush(objects)
        return await DATABASE_BREAKER.call(
            lambda: operation,
            failure_filter=_is_transient_database_failure,
        )

    async def refresh(self, instance, attribute_names=None, with_for_update=None):
        operation = super().refresh(
            instance,
            attribute_names=attribute_names,
            with_for_update=with_for_update,
        )
        return await DATABASE_BREAKER.call(
            lambda: operation,
            failure_filter=_is_transient_database_failure,
        )

engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=True,
    pool_recycle=settings.db_pool_recycle,
    connect_args={
        "statement_cache_size": 100,
        **({"ssl": True} if settings.database_requires_ssl else {}),
    },
)
async_session_factory = async_sessionmaker(
    engine,
    class_=ResilientAsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session
