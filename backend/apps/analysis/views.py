import threading
from utils.condition_registry import conditions_to_mdc_string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


def _write_scan_log(user_age: int, condition_names: list, product_id: str, confidence_score: float):
    """Runs in a background thread — never blocks the API response."""
    try:
        from models.analysis_models import ScanLog

        mdc_ids = conditions_to_mdc_string(condition_names)
        num_conditions = len([m for m in mdc_ids.split(",") if m]) if mdc_ids else 0

        ScanLog.objects.create(
            user_age=int(user_age) if user_age else 0,
            num_conditions=num_conditions,
            condition_ids=mdc_ids,
            product_id=str(product_id)[:100],
            confidence_score=round(float(confidence_score), 3),
        )
    except Exception as exc:
        print(f"[ScanLog] write failed: {exc}")


def log_scan(user_age: int, condition_names: list, product_id: str, confidence_score: float):
    """
    Non-blocking scan logger. Call after every successful barcode analysis.

    Args:
        user_age: integer age (0 if unknown / guest)
        condition_names: list of display-name strings e.g. ["Diabetes Type 2", "Asthma"]
        product_id: barcode string
        confidence_score: float 0.0–1.0
    """
    thread = threading.Thread(
        target=_write_scan_log,
        args=(user_age, condition_names, product_id, confidence_score),
        daemon=True,
    )
    thread.start()


class ScanHistoryView(APIView):
    """GET /api/v1/scan-history/ — Returns the last 5 scans for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from models.analysis_models import UserScanHistory
        history = UserScanHistory.objects.filter(user=request.user)[:5]
        data = [
            {
                "id": str(item.id),
                "barcode": item.barcode,
                "product_name": item.product_name,
                "brand": item.brand,
                "risk_label": item.risk_label,
                "risk_score": float(item.risk_score),
                "scanned_at": item.scanned_at.isoformat(),
                "result_payload": item.result_payload,
            }
            for item in history
        ]
        return Response({"history": data})
