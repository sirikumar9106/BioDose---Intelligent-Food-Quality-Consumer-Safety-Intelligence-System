from django.urls import path

from apps.products.views import (
    BarcodeAnalysisView,
    BarcodeScanView,
    ProductSearchView,
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
    path(
        "search/",
        ProductSearchView.as_view(),
        name="product_search",
    ),
]