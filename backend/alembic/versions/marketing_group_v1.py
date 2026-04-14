"""Add marketing group tables and fields

- Add code column to rewards
- Add detail_image_url column to promo_banners
- Rename target_url to action_type on promo_banners (or add new)
- Add survey_id column to promo_banners
- Create surveys table
- Create survey_questions table
- Create survey_responses table
- Create survey_answers table
"""
from alembic import op
import sqlalchemy as sa

revision = "marketing_group_v1"
down_revision = "5c707f520bda"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add code column to rewards
    op.add_column("rewards", sa.Column("code", sa.String(50), unique=True, nullable=True))

    # 2. Add detail_image_url and survey_id to promo_banners
    op.add_column("promo_banners", sa.Column("detail_image_url", sa.String(500), nullable=True))
    op.add_column("promo_banners", sa.Column("survey_id", sa.Integer, nullable=True))
    op.add_column("promo_banners", sa.Column("action_type", sa.String(20), nullable=True, server_default="detail"))
    # action_type: 'detail' (show full image) or 'survey' (open survey form)

    # 3. Create surveys table
    op.create_table(
        "surveys",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("reward_voucher_id", sa.Integer, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(["reward_voucher_id"], ["vouchers.id"]),
    )

    # 4. Create survey_questions table
    op.create_table(
        "survey_questions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("survey_id", sa.Integer, nullable=False),
        sa.Column("question_text", sa.Text, nullable=False),
        sa.Column("question_type", sa.String(20), nullable=False, server_default="text"),
        # question_type: 'text', 'single_choice', 'multiple_choice', 'rating'
        sa.Column("options", sa.JSON, nullable=True),
        # options: ["Option A", "Option B", ...] for choice types
        sa.Column("is_required", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"], ondelete="CASCADE"),
    )

    # 5. Create survey_responses table
    op.create_table(
        "survey_responses",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("survey_id", sa.Integer, nullable=False),
        sa.Column("user_id", sa.Integer, nullable=True),
        sa.Column("rewarded", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )

    # 6. Create survey_answers table
    op.create_table(
        "survey_answers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("response_id", sa.Integer, nullable=False),
        sa.Column("question_id", sa.Integer, nullable=False),
        sa.Column("answer_text", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["response_id"], ["survey_responses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["survey_questions.id"], ondelete="CASCADE"),
    )

    # 7. Add FK for promo_banners.survey_id
    op.create_foreign_key("fk_promo_banners_survey_id", "promo_banners", "surveys", ["survey_id"], ["id"])


def downgrade():
    op.drop_table("survey_answers")
    op.drop_table("survey_responses")
    op.drop_table("survey_questions")
    op.drop_table("surveys")
    op.drop_column("promo_banners", "action_type")
    op.drop_column("promo_banners", "survey_id")
    op.drop_column("promo_banners", "detail_image_url")
    op.drop_column("rewards", "code")
