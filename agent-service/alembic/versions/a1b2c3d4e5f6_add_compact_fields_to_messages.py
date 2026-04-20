"""add compact fields to messages

Revision ID: a1b2c3d4e5f6
Revises: 7adb31a5c676
Create Date: 2026-04-20 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '7adb31a5c676'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('compacted_at', sa.DateTime(), nullable=True))
    op.add_column('messages', sa.Column('compact_group_id', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'compact_group_id')
    op.drop_column('messages', 'compacted_at')
