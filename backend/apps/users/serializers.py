from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from rest_framework.validators import UniqueValidator
from models.user_models import UserProfile
from utils.condition_registry import CONDITION_REGISTRY


class UserRegistrationSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        validators=[UniqueValidator(queryset=UserProfile.objects.all(), message="Email already registered.")]
    )
    username = serializers.CharField(
        max_length=50,
        validators=[UniqueValidator(queryset=UserProfile.objects.all(), message="Username already taken.")]
    )
    password = serializers.CharField(
        write_only=True, required=True,
        style={"input_type": "password"},
    )
    confirm_password = serializers.CharField(
        write_only=True, required=True,
        style={"input_type": "password"},
    )
    otp = serializers.CharField(
        write_only=True, required=True
    )

    class Meta:
        model = UserProfile
        fields = ["email", "full_name", "username", "password", "confirm_password", "otp"]

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
            
        import re
        pwd = attrs["password"]
        if len(pwd) < 8:
            raise serializers.ValidationError({"password": "Password must be at least 8 characters long."})
        if not re.search(r'\d', pwd):
            raise serializers.ValidationError({"password": "Password must contain at least one number."})
        if not re.search(r'[a-zA-Z]', pwd):
            raise serializers.ValidationError({"password": "Password must contain at least one alphabet character."})
        if not re.search(r'[!@#$&*]', pwd):
            raise serializers.ValidationError({"password": "Password must contain at least one special character (!@#$&*)."})
            
        # OTP verification
        from models.user_models import EmailOTP
        email = attrs.get("email")
        otp = attrs.get("otp")
        
        otp_record = EmailOTP.objects.filter(email=email).first()
        if not otp_record:
            raise serializers.ValidationError({"otp": "No verification request found for this email."})
            
        if otp_record.is_expired():
            raise serializers.ValidationError({"otp": "OTP has expired. Please request a new one."})
            
        if otp_record.otp != otp:
            raise serializers.ValidationError({"otp": "Invalid OTP code."})
            
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        otp_val = validated_data.pop("otp")
        from models.user_models import EmailOTP
        EmailOTP.objects.filter(email=validated_data["email"], otp=otp_val).delete()
        return UserProfile.objects.create_user(**validated_data)


class ProfileSetupSerializer(serializers.Serializer):
    """Used once after signup to set DOB + health conditions. Age is computed."""
    date_of_birth = serializers.DateField()
    health_conditions = serializers.ListField(
        child=serializers.CharField(max_length=10),
        required=False,
        default=list,
    )

    def validate_date_of_birth(self, value):
        from datetime import date
        if value >= date.today():
            raise serializers.ValidationError("Date of birth must be in the past.")
        return value

    def validate_health_conditions(self, value):
        valid_ids = set(CONDITION_REGISTRY.keys())
        for mdc_id in value:
            if mdc_id.upper() not in valid_ids:
                raise serializers.ValidationError(f"'{mdc_id}' is not a valid condition ID.")
        return [v.upper() for v in value]

    def update(self, instance, validated_data):
        from datetime import date
        dob = validated_data["date_of_birth"]
        today = date.today()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        instance.date_of_birth = dob
        instance.age = age
        instance.health_conditions = validated_data.get("health_conditions", [])
        instance.profile_complete = True
        instance.save()
        return instance


class UserProfileSerializer(serializers.ModelSerializer):
    """Read/update serializer for the full profile."""
    class Meta:
        model = UserProfile
        fields = [
            "id", "email", "full_name", "username",
            "date_of_birth", "age", "health_conditions", "profile_complete",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "email", "full_name", "date_of_birth", "age", "created_at", "updated_at"]

from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db.models import Q

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields[self.username_field] = serializers.CharField(required=False)
        self.fields["username"] = serializers.CharField(required=False)

    def validate(self, attrs):
        # We allow 'username' to be either an actual username or an email
        login_credential = attrs.get(self.username_field) or attrs.get("username")
        password = attrs.get("password")
        
        if login_credential and password:
            user = UserProfile.objects.filter(
                Q(email=login_credential) | Q(username=login_credential)
            ).first()
            
            if user and user.check_password(password):
                self.user = user
                # We need to hack attrs to have email since Django expects it for auth
                attrs["email"] = user.email
                if "username" in attrs:
                    del attrs["username"]
            else:
                raise serializers.ValidationError("No active account found with the given credentials")
                
        return super().validate(attrs)
