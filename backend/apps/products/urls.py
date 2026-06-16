from django.urls import path

from apps.products.views import (
    BarcodeAnalysisView,
    BarcodeScanView,
)


urlpatterns = [
    path(
        "analyze/",
        BarcodeAnalysisView.as_view(),
    ),
    path(
        "scan-image/",
        BarcodeScanView.as_view(),
        name="scan_image",
    ),
]