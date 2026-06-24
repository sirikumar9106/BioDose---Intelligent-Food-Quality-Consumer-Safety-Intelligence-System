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
from django.core.mail import send_mail
from django.conf import settings
from models.user_models import EmailOTP

def generate_otp():
    return f"{random.randint(100000, 999999)}"


class SendSignupOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        if UserProfile.objects.filter(email=email).exists():
            return Response({"error": "Email is already registered."}, status=status.HTTP_400_BAD_REQUEST)
            
        otp = generate_otp()
        EmailOTP.objects.update_or_create(email=email, defaults={"otp": otp})
        
        try:
            send_mail(
                subject="BioDose Signup Verification Code",
                message=f"Your BioDose verification code is: {otp}. It will expire in 2.5 minutes.",
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@biodose.com",
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception:
            pass
        
        # Always output to console for development environment fallback
        print(f"\n--- EMAIL OTP SENT TO {email}: {otp} ---\n")
            
        return Response({"success": True, "message": "Verification code sent."})


class VerifySignupOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp", "").strip()
        
        if not email or not otp:
            return Response({"error": "Email and OTP are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        otp_record = EmailOTP.objects.filter(email=email).first()
        if not otp_record:
            return Response({"error": "No OTP verification request found for this email."}, status=status.HTTP_404_NOT_FOUND)
            
        if otp_record.is_expired():
            return Response({"error": "OTP has expired. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)
            
        if otp_record.otp != otp:
            return Response({"error": "Invalid OTP verification code."}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"success": True, "message": "OTP verified successfully."})


class SendForgotPasswordOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
            
        if not UserProfile.objects.filter(email=email).exists():
            return Response({"error": "No account associated with this email address."}, status=status.HTTP_404_NOT_FOUND)
            
        otp = generate_otp()
        EmailOTP.objects.update_or_create(email=email, defaults={"otp": otp})
        
        try:
            send_mail(
                subject="BioDose Password Reset Code",
                message=f"Your BioDose password reset verification code is: {otp}. It will expire in 2.5 minutes.",
                from_email=settings.DEFAULT_FROM_EMAIL or "noreply@biodose.com",
                recipient_list=[email],
                fail_silently=False,
            )
        except Exception:
            pass
            
        print(f"\n--- PASSWORD RESET OTP SENT TO {email}: {otp} ---\n")
            
        return Response({"success": True, "message": "Password reset code sent."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp", "").strip()
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")
        
        if not email or not otp or not new_password or not confirm_password:
            return Response({"error": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)
            
        if new_password != confirm_password:
            return Response({"error": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
            
        import re
        if len(new_password) < 8:
            return Response({"error": "Password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'\d', new_password):
            return Response({"error": "Password must contain at least one number."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'[a-zA-Z]', new_password):
            return Response({"error": "Password must contain at least one alphabet character."}, status=status.HTTP_400_BAD_REQUEST)
        if not re.search(r'[!@#$&*]', new_password):
            return Response({"error": "Password must contain at least one special character (!@#$&*)."}, status=status.HTTP_400_BAD_REQUEST)
            
        otp_record = EmailOTP.objects.filter(email=email).first()
        if not otp_record:
            return Response({"error": "No verification request found for this email."}, status=status.HTTP_404_NOT_FOUND)
            
        if otp_record.is_expired():
            return Response({"error": "OTP has expired. Please request a new one."}, status=status.HTTP_400_BAD_REQUEST)
            
        if otp_record.otp != otp:
            return Response({"error": "Invalid OTP code."}, status=status.HTTP_400_BAD_REQUEST)
            
        user = UserProfile.objects.filter(email=email).first()
        if not user:
            return Response({"error": "User account not found."}, status=status.HTTP_404_NOT_FOUND)
            
        user.set_password(new_password)
        user.save()
        otp_record.delete()
        
        refresh = RefreshToken.for_user(user)
        
        return Response({
            "success": True,
            "message": "Password reset successfully.",
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "profile_complete": user.profile_complete
        })
