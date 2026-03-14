from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.pipeline import Pipeline, PipelineStatus
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineUpdate,
    PipelineValidationResult,
    ValidationError,
)


def create_pipeline(db: Session, data: PipelineCreate) -> Pipeline:
    pipeline = Pipeline(
        name=data.name,
        description=data.description,
        source_connector_id=data.source_connector_id,
        definition=data.definition,
    )
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return pipeline


def get_pipelines(db: Session) -> list[Pipeline]:
    return db.query(Pipeline).order_by(Pipeline.updated_at.desc()).all()


def get_pipeline(db: Session, pipeline_id: uuid.UUID) -> Pipeline | None:
    return db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()


def update_pipeline(db: Session, pipeline: Pipeline, data: PipelineUpdate) -> Pipeline:
    if data.name is not None:
        pipeline.name = data.name
    if data.description is not None:
        pipeline.description = data.description
    if data.definition is not None:
        pipeline.definition = data.definition
    if data.source_connector_id is not None:
        pipeline.source_connector_id = data.source_connector_id
    if data.schedule_cron is not None:
        pipeline.schedule_cron = data.schedule_cron
    db.commit()
    db.refresh(pipeline)
    return pipeline


def delete_pipeline(db: Session, pipeline: Pipeline) -> None:
    db.delete(pipeline)
    db.commit()


def validate_pipeline(db: Session, pipeline: Pipeline) -> PipelineValidationResult:
    errors: list[ValidationError] = []
    warnings: list[ValidationError] = []
    definition = pipeline.definition

    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])

    if not nodes:
        errors.append(ValidationError(message="Pipeline must have at least one node"))
        return PipelineValidationResult(valid=False, errors=errors)

    node_map = {n["id"]: n for n in nodes}
    node_types = {n["id"]: n.get("type", "") for n in nodes}

    # Check for at least one source and one destination
    source_nodes = [n for n in nodes if n.get("type") == "source"]
    dest_nodes = [n for n in nodes if n.get("type") == "destination"]

    if not source_nodes:
        errors.append(ValidationError(message="Pipeline must have at least one source node"))
    if not dest_nodes:
        errors.append(ValidationError(message="Pipeline must have at least one destination node"))

    # Build adjacency for cycle detection
    adj: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    incoming: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src and tgt:
            adj[src].append(tgt)
            in_degree.setdefault(tgt, 0)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1
            incoming[tgt].append(src)

    # Topological sort for cycle detection
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    visited = 0
    while queue:
        current = queue.pop(0)
        visited += 1
        for neighbor in adj.get(current, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if visited != len(nodes):
        errors.append(ValidationError(message="Pipeline contains a cycle"))

    # Validate join nodes have exactly 2 inputs
    for node in nodes:
        if node.get("type") == "join":
            input_count = len(incoming.get(node["id"], []))
            if input_count != 2:
                errors.append(
                    ValidationError(
                        node_id=node["id"],
                        message=f"Join node requires exactly 2 input connections, has {input_count}",
                    )
                )

    # Check for orphaned nodes (no connections at all)
    connected_nodes = set()
    for edge in edges:
        connected_nodes.add(edge.get("source"))
        connected_nodes.add(edge.get("target"))

    for node in nodes:
        nid = node["id"]
        ntype = node.get("type", "")
        if nid not in connected_nodes and ntype not in ("source", "destination"):
            warnings.append(
                ValidationError(node_id=nid, message="Node has no connections")
            )

    # Validate source nodes have required config
    for node in source_nodes:
        data = node.get("data", {})
        if not data.get("connectorId"):
            errors.append(
                ValidationError(node_id=node["id"], message="Source node missing connector")
            )
        if not data.get("table"):
            errors.append(
                ValidationError(node_id=node["id"], message="Source node missing table")
            )

    valid = len(errors) == 0
    if valid:
        pipeline.status = PipelineStatus.VALID
    else:
        pipeline.status = PipelineStatus.INVALID
    db.commit()

    return PipelineValidationResult(valid=valid, errors=errors, warnings=warnings)
