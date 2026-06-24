from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import (
    UserRegistrationSerializer,
    UserProfileSerializer,
    ProfileSetupSerializer,
    CustomTokenObtainPairSerializer,
)
from models.user_models import UserProfile
from utils.condition_registry import CONDITION_REGISTRY, all_display_names


class CustomLoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/ - Supports email OR username"""
    serializer_class = CustomTokenObtainPairSerializer


class CheckUsernameView(APIView):
    """GET /api/v1/auth/check-username/?username=..."""
    permission_classes = [AllowAny]
    
    def get(self, request):
        username = request.query_params.get("username", "").strip()
        if not username:
            return Response({"error": "Username is required"}, status=status.HTTP_400_BAD_REQUEST)
            
        exists = UserProfile.objects.filter(username__iexact=username).exists()
        return Response({"available": not exists})


class RegisterView(generics.CreateAPIView):
    """POST /api/v1/auth/register/"""
    queryset = UserProfile.objects.all()
    permission_classes = [AllowAny]
    serializer_class = UserRegistrationSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        return Response({
            "message": "Account created successfully.",
            "user": UserProfileSerializer(user).data,
            "access":  str(refresh.access_token),
            "refresh": str(refresh),
        }, status=status.HTTP_201_CREATED)


class ProfileSetupView(APIView):
    """POST/PATCH /api/v1/auth/profile/setup/ — called once after first login."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Return the 21 condition options the user can choose from."""
        conditions = [
            {"id": mdc_id, "name": info["display"]}
            for mdc_id, info in CONDITION_REGISTRY.items()
        ]
        return Response({
            "conditions": conditions,
            "current_profile": UserProfileSerializer(request.user).data,
        })

    def post(self, request):
        serializer = ProfileSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(request.user, serializer.validated_data)
        return Response({
            "message": "Profile saved.",
            "user": UserProfileSerializer(request.user).data,
        })


class ProfileView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/profile/"""
    permission_classes = [IsAuthenticated]
    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


class UpdateUsernameView(APIView):
    """PATCH /api/v1/auth/update-username/ — updates username without password."""
    permission_classes = [IsAuthenticated]

    def patch(self, request):
        new_username = request.data.get("username", "").strip()
        if not new_username:
            return Response({"error": "Username is required"}, status=status.HTTP_400_BAD_REQUEST)
        if UserProfile.objects.filter(username__iexact=new_username).exclude(pk=request.user.pk).exists():
            return Response({"error": "Username already taken"}, status=status.HTTP_409_CONFLICT)
        request.user.username = new_username
        request.user.save()
        return Response({"message": "Username updated.", "username": new_username})


class UpdateConditionsView(APIView):
    """POST /api/v1/auth/update-conditions/ — updates health conditions, requires password verification."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get("password", "")
        conditions = request.data.get("health_conditions", [])
        
        if not request.user.check_password(password):
            return Response({"error": "Incorrect password."}, status=status.HTTP_403_FORBIDDEN)
        
        valid_ids = set(CONDITION_REGISTRY.keys())
        for mdc_id in conditions:
            if mdc_id.upper() not in valid_ids:
                return Response({"error": f"'{mdc_id}' is not a valid condition ID."}, status=status.HTTP_400_BAD_REQUEST)
        
        request.user.health_conditions = [v.upper() for v in conditions]
        request.user.save()
        return Response({"message": "Health conditions updated.", "health_conditions": request.user.health_conditions})


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklists the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response({"error": "Refresh token required."}, status=status.HTTP_400_BAD_REQUEST)
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Logged out successfully."}, status=status.HTTP_205_RESET_CONTENT)
        except Exception:
            return Response({"error": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)


import random
import uuid
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from models.user_models import OTPVerification, TempToken

class SendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        purpose = request.data.get("purpose", "").strip()

        if not email or not purpose:
            return Response({"error": "Email and purpose are required."}, status=status.HTTP_400_BAD_REQUEST)

        if purpose not in ["signup", "reset"]:
            return Response({"error": "Invalid purpose."}, status=status.HTTP_400_BAD_REQUEST)

        email_exists = UserProfile.objects.filter(email=email).exists()

        if purpose == "signup" and email_exists:
            return Response({"error": "Account already exists with this email."}, status=status.HTTP_400_BAD_REQUEST)

        if purpose == "reset" and not email_exists:
            return Response({"error": "No account found with this email."}, status=status.HTTP_400_BAD_REQUEST)

        otp = str(random.randint(100000, 999999))
        OTPVerification.objects.update_or_create(
            email=email,
            purpose=purpose,
            defaults={"otp": otp, "is_used": False, "created_at": timezone.now() if 'timezone' in globals() else timezone.now()}
        )

        subject = "BioDose Email Verification" if purpose == "signup" else "BioDose Password Reset Verification"
        intro_text = (
            "Thank you for joining BioDose. Please verify your email address to complete your registration."
            if purpose == "signup"
            else "We received a request to reset your BioDose account password. Please use the verification code below to proceed."
        )

        html_message = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    background-color: #0b0f19;
                    color: #f3f4f6;
                    margin: 0;
                    padding: 0;
                }}
                .container {{
                    max-width: 480px;
                    margin: 40px auto;
                    padding: 32px;
                    background-color: #111827;
                    border: 1px solid #1f2937;
                    border-radius: 24px;
                    text-align: center;
                }}
                .logo {{
                    font-size: 24px;
                    font-weight: 800;
                    color: #10b981;
                    letter-spacing: -0.05em;
                    margin-bottom: 24px;
                    text-transform: uppercase;
                }}
                .title {{
                    font-size: 20px;
                    font-weight: 700;
                    margin-bottom: 12px;
                    color: #ffffff;
                }}
                .intro {{
                    font-size: 14px;
                    line-height: 1.6;
                    color: #9ca3af;
                    margin-bottom: 32px;
                }}
                .code-box {{
                    display: inline-block;
                    padding: 16px 32px;
                    font-size: 32px;
                    font-weight: 800;
                    letter-spacing: 6px;
                    color: #10b981;
                    background-color: #0b0f19;
                    border: 1px solid #1f2937;
                    border-radius: 16px;
                    margin-bottom: 32px;
                    font-family: Courier, monospace;
                }}
                .footer {{
                    font-size: 12px;
                    color: #6b7280;
                    border-top: 1px solid #1f2937;
                    padding-top: 20px;
                }}
                .warning {{
                    color: #ef4444;
                    font-weight: 600;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="logo">BioDose</div>
                <div class="title">{subject}</div>
                <div class="intro">{intro_text}</div>
                <div class="code-box">{otp}</div>
                <div class="footer">
                    This code is valid for <span class="warning">10 minutes</span> and can only be used once.<br>
                    If you did not request this email, please ignore it.
                </div>
            </div>
        </body>
        </html>
        """
        plain_message = f"{intro_text}\n\nYour BioDose verification code is: {otp}\n\nThis code will expire in 10 minutes."

        try:
            send_mail(
                subject=subject,
                message=plain_message,
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@biodose.com",
                recipient_list=[email],
                fail_silently=False,
                html_message=html_message,
            )
        except Exception:
            pass

        # Console print fallback for local development
        print(f"\n--- EMAIL OTP SENT TO {email} for {purpose}: {otp} ---\n")

        return Response({"message": "OTP sent"})


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp", "").strip()
        purpose = request.data.get("purpose", "").strip()

        if not email or not otp or not purpose:
            return Response({"error": "Email, OTP, and purpose are required."}, status=status.HTTP_400_BAD_REQUEST)

        verification = OTPVerification.objects.filter(
            email=email,
            otp=otp,
            purpose=purpose,
            is_used=False
        ).order_by("-created_at").first()

        if not verification:
            return Response({"error": "Wrong OTP code."}, status=status.HTTP_400_BAD_REQUEST)

        if verification.is_expired():
            return Response({"error": "Expired OTP. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)

        verification.is_used = True
        verification.save()

        # Generate TempToken
        temp_token = TempToken.objects.create(
            email=email,
            purpose=purpose
        )

        return Response({
            "verified": True,
            "token": str(temp_token.token)
        })


class CompleteSignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token_str = request.data.get("token", "").strip()
        full_name = request.data.get("full_name", "").strip()
        username = request.data.get("username", "").strip()
        password = request.data.get("password", "")

        if not token_str or not full_name or not username or not password:
            return Response({"error": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_uuid = uuid.UUID(token_str)
        except ValueError:
            return Response({"error": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)

        temp_token = TempToken.objects.filter(
            token=token_uuid,
            purpose="signup",
            is_used=False
        ).first()

        if not temp_token:
            return Response({"error": "Invalid or already used verification token."}, status=status.HTTP_400_BAD_REQUEST)

        if temp_token.is_expired():
            return Response({"error": "Verification token expired. Please verify your email again."}, status=status.HTTP_400_BAD_REQUEST)

        if UserProfile.objects.filter(username__iexact=username).exists():
            return Response({"error": "Username already taken."}, status=status.HTTP_400_BAD_REQUEST)

        if UserProfile.objects.filter(email=temp_token.email).exists():
            return Response({"error": "Account already exists with this email."}, status=status.HTTP_400_BAD_REQUEST)

        # Create user
        user = UserProfile.objects.create_user(
            email=temp_token.email,
            username=username,
            full_name=full_name,
            password=password
        )

        temp_token.is_used = True
        temp_token.save()

        refresh = RefreshToken.for_user(user)

        return Response({
            "message": "Account created successfully.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "profile_complete": user.profile_complete
        })


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token_str = request.data.get("token", "").strip()
        new_password = request.data.get("new_password", "")

        if not token_str or not new_password:
            return Response({"error": "Token and new password are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            token_uuid = uuid.UUID(token_str)
        except ValueError:
            return Response({"error": "Invalid token."}, status=status.HTTP_400_BAD_REQUEST)

        temp_token = TempToken.objects.filter(
            token=token_uuid,
            purpose="reset",
            is_used=False
        ).first()

        if not temp_token:
            return Response({"error": "Invalid or already used reset token."}, status=status.HTTP_400_BAD_REQUEST)

        if temp_token.is_expired():
            return Response({"error": "Reset token expired. Please request a new OTP."}, status=status.HTTP_400_BAD_REQUEST)

        import re
        if len(new_password) < 8:
            return Response({"error": "Password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'\d', new_password):
            return Response({"error": "Password must contain at least one number."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'[a-zA-Z]', new_password):
            return Response({"error": "Password must contain at least one alphabet character."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'[!@#$&*]', new_password):
            return Response({"error": "Password must contain at least one special character (!@#$&*)."}, status=status.HTTP_400_BAD_REQUEST)

        user = UserProfile.objects.filter(email=temp_token.email).first()
        if not user:
            return Response({"error": "User account not found."}, status=status.HTTP_404_NOT_FOUND)

        user.set_password(new_password)
        user.save()

        temp_token.is_used = True
        temp_token.save()

        return Response({"message": "Password updated successfully."})

