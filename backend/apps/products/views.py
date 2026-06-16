from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from apps.products.serializers import ScanRequestSerializer
from apps.products.services.barcode import fetch_product, detect_barcode
from apps.products.services.extractor import extract_additives
from apps.analysis.services.matcher import match_additives
from apps.analysis.services.scorer import calculate_risk_scores
from apps.analysis.services.report import generate_report
from utils.condition_registry import mdc_to_column


class BarcodeAnalysisView(APIView):
    """
    POST /products/analyze/

    Body:
        barcode      (str, required)
        conditions   (list[str], optional) — display names e.g. ["Diabetes Type 2"]
        user_age     (int, optional, default 0)

    Returns full product analysis: additives + nutrition + risk report.
    If user is authenticated, their stored age and conditions are used automatically.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ScanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        barcode    = serializer.validated_data["barcode"]
        conditions = serializer.validated_data["conditions"]   # Should be MDC IDs from frontend
        user_age   = serializer.validated_data["user_age"]

        # If the user is logged in, prefer their saved profile data
        if request.user and request.user.is_authenticated:
            if not user_age:
                user_age = getattr(request.user, "age", 0) or 0
            if not conditions:
                # Stored as MDC IDs
                conditions = getattr(request.user, "health_conditions", []) or []

        # We keep conditions as MDC IDs to pass to scorer
        mdc_ids = [c.upper().strip() for c in conditions if c.upper().strip().startswith("MDC")]

        # Fetch product from OpenFoodFacts
        product = fetch_product(barcode)
        if not product:
            return Response(
                {"error": "Product not found on OpenFoodFacts."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Extract additives
        extracted = extract_additives(product)

        # Match against IDP dataset
        matched = match_additives(extracted)

        # Score against user's conditions + enriched with toxicology + interactions
        scored = calculate_risk_scores(matched, mdc_ids, product=product)

        # Generate final report (EBM model)
        report = generate_report(scored)

        # Log this scan anonymously and non-blocking
        from apps.analysis.views import log_scan
        from utils.condition_registry import mdc_to_display
        display_names = [mdc_to_display(m) for m in mdc_ids]
        
        log_scan(
            user_age=user_age,
            condition_names=display_names,
            product_id=barcode,
            confidence_score=report.get("final_risk_score", 0.0),
        )

        # Save to per-user scan history (authenticated users only, max 5 entries)
        if request.user and request.user.is_authenticated:
            from models.analysis_models import UserScanHistory
            full_payload = {"product": product, "analysis": report}
            UserScanHistory.objects.create(
                user=request.user,
                barcode=barcode,
                product_name=product.get("product_name", "Unknown Product"),
                brand=product.get("brand", ""),
                risk_label=report.get("risk_label", ""),
                risk_score=report.get("final_risk_score", 0.0),
                result_payload=full_payload,
            )
            # Keep only the most recent 5 — delete older ones
            history_ids = list(
                UserScanHistory.objects.filter(user=request.user)
                .values_list("id", flat=True)
            )
            if len(history_ids) > 5:
                ids_to_delete = history_ids[5:]  # ordered by -scanned_at, so these are oldest
                UserScanHistory.objects.filter(id__in=ids_to_delete).delete()

        return Response({
            "product":  product,
            "analysis": report,
        })


def _display_to_col(display_name: str) -> str:
    """Map a display condition name → IDP.csv column name via condition registry."""
    from utils.condition_registry import name_to_mdc, mdc_to_column
    mdc = name_to_mdc(display_name)
    if mdc:
        return mdc_to_column(mdc)
    # Fallback: try direct column match
    return f"{display_name.upper()} (SCORE)"


class BarcodeScanView(APIView):
    """
    POST /products/scan-image/
    Body:
        image (file)
    Returns:
        {"barcode": "..."}
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        image_file = request.FILES.get("image") or request.FILES.get("file")
        if not image_file:
            if request.FILES:
                image_file = next(iter(request.FILES.values()))

        if not image_file:
            return Response(
                {"error": "No image file provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            result = detect_barcode(image_file)
            if not result.get("success") or not result.get("barcode"):
                return Response(
                    {"error": result.get("message", "Could not decode barcode in this image. Try another image or use manual entry.")},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response({"barcode": result.get("barcode")})
        except Exception as e:
            return Response(
                {"error": f"Failed to process image: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )