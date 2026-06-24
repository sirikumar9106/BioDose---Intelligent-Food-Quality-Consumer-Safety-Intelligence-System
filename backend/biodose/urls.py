from django.urls import path, include
from apps.users.views import SendOTPView, VerifyOTPView, CompleteSignupView, ResetPasswordView

urlpatterns = [
    path("products/",     include("apps.products.urls")),
    path("api/v1/auth/",  include("apps.users.urls")),
    path("api/v1/analysis/", include("apps.analysis.urls")),
    path("api/auth/send-otp/", SendOTPView.as_view(), name="auth_send_otp"),
    path("api/auth/verify-otp/", VerifyOTPView.as_view(), name="auth_verify_otp"),
    path("api/auth/complete-signup/", CompleteSignupView.as_view(), name="auth_complete_signup"),
    path("api/auth/reset-password/", ResetPasswordView.as_view(), name="auth_reset_password"),
]