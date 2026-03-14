from __future__ import annotations

from fastapi import HTTPException, status


class ConnectorNotFoundError(HTTPException):
    def __init__(self, connector_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector {connector_id} not found",
        )


class PipelineNotFoundError(HTTPException):
    def __init__(self, pipeline_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline {pipeline_id} not found",
        )


class ConnectorTestError(HTTPException):
    def __init__(self, message: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection test failed: {message}",
        )
