from rest_framework.response import Response

from rest_framework.views import APIView

from apps.products.serializers import (
    BarcodeSerializer,
    UserProfileSerializer,
)

from apps.products.services.barcode import (
    fetch_product,
)

from apps.products.services.extractor import (
    extract_additives,
)

from apps.analysis.services.matcher import (
    match_additives,
)

from apps.analysis.services.scorer import (
    calculate_risk_scores,
)

from apps.analysis.services.report import (
    generate_report,
)


class BarcodeAnalysisView(APIView):
    def post(self, request):
        barcode_serializer = BarcodeSerializer(
            data=request.data
        )

        profile_serializer = (
            UserProfileSerializer(
                data=request.data
            )
        )

        barcode_serializer.is_valid(
            raise_exception=True
        )

        profile_serializer.is_valid(
            raise_exception=True
        )

        barcode = barcode_serializer.validated_data[
            "barcode"
        ]

        conditions = (
            profile_serializer.validated_data[
                "conditions"
            ]
        )

        product = fetch_product(barcode)

        if not product:
            return Response({
                "error": "Product not found"
            })

        extracted = extract_additives(product)

        matched = match_additives(extracted)

        scored = calculate_risk_scores(
            matched,
            conditions,
        )

        report = generate_report(scored)

        response = {
            "product": product,
            "analysis": report,
        }

        return Response(response)