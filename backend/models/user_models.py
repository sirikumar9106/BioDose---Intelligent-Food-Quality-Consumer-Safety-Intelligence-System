import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.contrib.postgres.fields import ArrayField
from models.managers import CustomUserManager


class UserProfile(AbstractBaseUser, PermissionsMixin):
    """
    BioDose user account.
    Signup fields: email, full_name, username, password.
    Post-signup profile: age, health_conditions (list of MDC IDs).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # ── Signup credentials ──────────────────────────────────────────────────
    email    = models.EmailField(unique=True)
    username = models.CharField(max_length=50, unique=True)
    full_name = models.CharField(max_length=255)

    # ── Health profile (set after first login) ──────────────────────────────
    date_of_birth = models.DateField(null=True, blank=True)
    age = models.IntegerField(null=True, blank=True)  # Calculated from DOB
    # Stores MDC IDs: ["MDC01", "MDC03", "MDC11"]
    health_conditions = ArrayField(
        models.CharField(max_length=10),
        default=list,
        blank=True,
    )
    profile_complete = models.BooleanField(default=False)

    # ── Django required fields ──────────────────────────────────────────────
    is_active = models.BooleanField(default=True)
    is_staff  = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = CustomUserManager()

    USERNAME_FIELD  = "email"
    REQUIRED_FIELDS = ["username", "full_name"]

    class Meta:
        app_label = "users"

    def __str__(self):
        return f"{self.username} <{self.email}>"


class EmailOTP(models.Model):
    email = models.EmailField(unique=True)
    otp = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "users"

    def is_expired(self):
        from django.utils import timezone
        import datetime
        return timezone.now() > self.created_at + datetime.timedelta(seconds=150) # 2.5 minutes

