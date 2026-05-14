from rest_framework import serializers


class AnalysisResponseSerializer(
    serializers.Serializer
):
    product_risk_summary = serializers.ListField()

    additives = serializers.ListField()