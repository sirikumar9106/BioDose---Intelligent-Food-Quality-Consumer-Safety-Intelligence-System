from django.urls import path, include

urlpatterns = [
    path("products/",     include("apps.products.urls")),
    path("api/v1/auth/",  include("apps.users.urls")),
    path("api/v1/analysis/", include("apps.analysis.urls")),
]