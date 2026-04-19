"""add result_type and result_detail to assessments

Revision ID: 7adb31a5c676
Revises: fa57b325df6c
Create Date: 2026-04-19 13:09:31.960347

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7adb31a5c676'
down_revision: Union[str, None] = 'fa57b325df6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assessments', sa.Column('result_type', sa.String(length=20), nullable=True))
    op.add_column('assessments', sa.Column('result_detail', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('assessments', 'result_detail')
    op.drop_column('assessments', 'result_type')
