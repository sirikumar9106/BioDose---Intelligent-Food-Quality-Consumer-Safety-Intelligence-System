from rest_framework import serializers


class BarcodeSerializer(serializers.Serializer):
    barcode = serializers.CharField(max_length=50)


class ScanRequestSerializer(serializers.Serializer):
    barcode = serializers.CharField(max_length=50)
    conditions = serializers.ListField(
        child=serializers.CharField(max_length=100),
        required=False,
        default=list,
    )
    user_age = serializers.IntegerField(
        required=False,
        default=0,
        min_value=0,
        max_value=130,
    )