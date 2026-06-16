from django.db import migrations, models
from decimal import Decimal


MOCK_ROWS = [
    # (user_age, num_conditions, condition_ids, product_id, confidence_score)
    (28, 2, "MDC01,MDC02", "8901058001029", Decimal("0.673")),
    (45, 3, "MDC05,MDC06,MDC11", "5000159484695", Decimal("0.412")),
    (62, 1, "MDC16", "7622210449283", Decimal("0.251")),
    (19, 2, "MDC03,MDC09", "0737628064502", Decimal("0.889")),
]


def seed_mock_data(apps, schema_editor):
    ScanLog = apps.get_model("analysis", "ScanLog")
    # Only seed if table is empty (idempotent)
    if ScanLog.objects.count() == 0:
        for age, num_cond, cond_ids, product_id, score in MOCK_ROWS:
            ScanLog.objects.create(
                user_age=age,
                num_conditions=num_cond,
                condition_ids=cond_ids,
                product_id=product_id,
                confidence_score=score,
            )


def unseed_mock_data(apps, schema_editor):
    ScanLog = apps.get_model("analysis", "ScanLog")
    mock_product_ids = [row[3] for row in MOCK_ROWS]
    ScanLog.objects.filter(product_id__in=mock_product_ids).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("analysis", "0001_initial"),
    ]

    operations = [
        # Drop old InferenceLog table cleanly
        migrations.RunSQL(
            "DROP TABLE IF EXISTS analysis_inferencelog CASCADE;",
            reverse_sql="SELECT 1;",
        ),
        # Drop old ModelRegistry and recreate cleanly
        migrations.RunSQL(
            "DROP TABLE IF EXISTS analysis_modelregistry CASCADE;",
            reverse_sql="SELECT 1;",
        ),
        # Create ScanLog
        migrations.CreateModel(
            name="ScanLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_age", models.IntegerField()),
                ("num_conditions", models.IntegerField()),
                ("condition_ids", models.CharField(max_length=150)),
                ("product_id", models.CharField(max_length=100)),
                ("confidence_score", models.DecimalField(decimal_places=3, max_digits=4)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"app_label": "analysis", "db_table": "analysis_scanlog"},
        ),
        # Recreate ModelRegistry
        migrations.CreateModel(
            name="ModelRegistry",
            fields=[
                ("id", models.UUIDField(default=__import__("uuid").uuid4, editable=False, primary_key=True, serialize=False)),
                ("model_name", models.CharField(max_length=50)),
                ("version", models.CharField(max_length=50)),
                ("weights_path", models.CharField(max_length=255)),
                ("mae_score", models.DecimalField(decimal_places=4, max_digits=5)),
                ("training_data_size", models.IntegerField()),
                ("is_production", models.BooleanField(default=False)),
                ("promoted_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"app_label": "analysis", "db_table": "analysis_modelregistry"},
        ),
        # Seed 4 mock rows
        migrations.RunPython(seed_mock_data, reverse_code=unseed_mock_data),
    ]
