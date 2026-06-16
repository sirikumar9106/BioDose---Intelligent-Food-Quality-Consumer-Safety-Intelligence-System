from django.urls import path
from apps.analysis.views import ScanHistoryView

urlpatterns = [
    path("scan-history/", ScanHistoryView.as_view(), name="scan_history"),
]