"""Add request metadata fields to audit_log.

Revision ID: apr2026_audit_metadata_v6
Revises: apr2026_content_actions_v5
Create Date: 2026-04-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from app import migration_utils as au

revision: str = 'apr2026_audit_metadata_v6'
down_revision: Union[str, None] = 'apr2026_content_actions_v5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not au.column_exists('audit_log', 'method'):
        op.add_column('audit_log', sa.Column('method', sa.String(length=10), nullable=True))
    if not au.column_exists('audit_log', 'path'):
        op.add_column('audit_log', sa.Column('path', sa.String(length=500), nullable=True))
    if not au.column_exists('audit_log', 'status_code'):
        op.add_column('audit_log', sa.Column('status_code', sa.Integer(), nullable=True))
    if not au.column_exists('audit_log', 'user_agent'):
        op.add_column('audit_log', sa.Column('user_agent', sa.String(length=255), nullable=True))
    if not au.column_exists('audit_log', 'request_id'):
        op.add_column('audit_log', sa.Column('request_id', sa.String(length=100), nullable=True))

    if not au.index_exists('audit_log', 'ix_audit_log_request_id'):
        op.create_index('ix_audit_log_request_id', 'audit_log', ['request_id'], unique=False)
    if not au.index_exists('audit_log', 'ix_audit_log_action_created'):
        op.create_index('ix_audit_log_action_created', 'audit_log', ['action', 'created_at'], unique=False)
    if not au.index_exists('audit_log', 'ix_audit_log_user_created'):
        op.create_index('ix_audit_log_user_created', 'audit_log', ['user_id', 'created_at'], unique=False)
    if not au.index_exists('audit_log', 'ix_audit_log_entity'):
        op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'], unique=False)


def downgrade() -> None:
    if au.index_exists('audit_log', 'ix_audit_log_entity'):
        op.drop_index('ix_audit_log_entity', table_name='audit_log')
    if au.index_exists('audit_log', 'ix_audit_log_user_created'):
        op.drop_index('ix_audit_log_user_created', table_name='audit_log')
    if au.index_exists('audit_log', 'ix_audit_log_action_created'):
        op.drop_index('ix_audit_log_action_created', table_name='audit_log')
    if au.index_exists('audit_log', 'ix_audit_log_request_id'):
        op.drop_index('ix_audit_log_request_id', table_name='audit_log')
    if au.column_exists('audit_log', 'request_id'):
        op.drop_column('audit_log', 'request_id')
    if au.column_exists('audit_log', 'user_agent'):
        op.drop_column('audit_log', 'user_agent')
    if au.column_exists('audit_log', 'status_code'):
        op.drop_column('audit_log', 'status_code')
    if au.column_exists('audit_log', 'path'):
        op.drop_column('audit_log', 'path')
    if au.column_exists('audit_log', 'method'):
        op.drop_column('audit_log', 'method')
