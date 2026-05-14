from rest_framework import serializers


class BarcodeSerializer(serializers.Serializer):
    barcode = serializers.CharField()


class UserProfileSerializer(serializers.Serializer):
    conditions = serializers.ListField(
        child=serializers.CharField()
    )