from django.urls import path

from apps.products.views import (
    BarcodeAnalysisView,
)


urlpatterns = [
    path(
        "analyze/",
        BarcodeAnalysisView.as_view(),
    ),
]