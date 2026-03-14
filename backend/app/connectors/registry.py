from __future__ import annotations

from app.connectors.base import BaseConnector
from app.models.connector import ConnectorType


class ConnectorRegistry:
    _registry: dict[ConnectorType, type[BaseConnector]] = {}

    @classmethod
    def register(cls, connector_type: ConnectorType):
        def decorator(connector_class: type[BaseConnector]):
            cls._registry[connector_type] = connector_class
            return connector_class
        return decorator

    @classmethod
    def create(cls, connector_type: ConnectorType, config: dict) -> BaseConnector:
        if connector_type not in cls._registry:
            raise ValueError(f"Unknown connector type: {connector_type}")
        return cls._registry[connector_type](config)

    @classmethod
    def get_supported_types(cls) -> list[ConnectorType]:
        return list(cls._registry.keys())
