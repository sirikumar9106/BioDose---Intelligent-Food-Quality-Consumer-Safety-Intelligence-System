from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterView, LogoutView, ProfileView, ProfileSetupView, CustomLoginView,
    CheckUsernameView, UpdateUsernameView, UpdateConditionsView
)

urlpatterns = [
    path("register/",       RegisterView.as_view(),     name="auth_register"),
    path("check-username/", CheckUsernameView.as_view(), name="auth_check_username"),
    path("login/",          CustomLoginView.as_view(),   name="auth_login"),
    path("logout/",         LogoutView.as_view(),        name="auth_logout"),
    path("token/refresh/",  TokenRefreshView.as_view(),  name="auth_token_refresh"),
    path("profile/",        ProfileView.as_view(),        name="auth_profile"),
    path("profile/setup/",       ProfileSetupView.as_view(),   name="auth_profile_setup"),
    path("update-username/",      UpdateUsernameView.as_view(), name="auth_update_username"),
    path("update-conditions/",    UpdateConditionsView.as_view(), name="auth_update_conditions"),
]