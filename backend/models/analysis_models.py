import uuid
from django.db import models
from django.conf import settings


class ScanLog(models.Model):
    """
    Anonymous 5-column table collecting real-time interaction data.
    Purpose: feed the shadow ML training pipeline.
    No user_id — privacy by design.
    """
    user_age = models.IntegerField()
    num_conditions = models.IntegerField()
    condition_ids = models.CharField(max_length=150)   # e.g. "MDC01,MDC05,MDC11"
    product_id = models.CharField(max_length=100)      # barcode
    confidence_score = models.DecimalField(max_digits=4, decimal_places=3)  # 0.000 – 1.000
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "analysis"
        db_table = "analysis_scanlog"

    def __str__(self):
        return f"ScanLog({self.product_id}, {self.confidence_score})"


class UserScanHistory(models.Model):
    """
    Stores the last 5 scan results per user.
    On every new scan, oldest entry is deleted if user already has 5.
    Full product + analysis JSON is stored for quick retrieval.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scan_history"
    )
    barcode = models.CharField(max_length=100)
    product_name = models.CharField(max_length=255)
    brand = models.CharField(max_length=255, blank=True, default="")
    risk_label = models.CharField(max_length=50)
    risk_score = models.DecimalField(max_digits=4, decimal_places=3)
    # Full result JSON for later replay
    result_payload = models.JSONField(default=dict)
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "analysis"
        db_table = "analysis_userscanhistory"
        ordering = ["-scanned_at"]

    def __str__(self):
        return f"{self.user} → {self.product_name} ({self.risk_score})"



class ModelRegistry(models.Model):
    """
    Tracks trained shadow model versions and their performance.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model_name = models.CharField(max_length=50)   # shadow_a / shadow_b / production
    version = models.CharField(max_length=50)
    weights_path = models.CharField(max_length=255)
    mae_score = models.DecimalField(max_digits=5, decimal_places=4)
    training_data_size = models.IntegerField()
    is_production = models.BooleanField(default=False)
    promoted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "analysis"
        db_table = "analysis_modelregistry"


class UserChatContext(models.Model):
    """
    Stores permanent personalized context and chat history for MedSensei.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_contexts"
    )
    situation = models.TextField(blank=True, default="")
    chat_history = models.JSONField(default=list, blank=True)
    temp_barcode = models.CharField(max_length=100, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "analysis"
        db_table = "analysis_userchatcontext"

    def __str__(self):
        return f"ChatContext({self.user.username})"
