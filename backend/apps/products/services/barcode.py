import requests

from utils.logger import app_logger


BASE_URL = "https://world.openfoodfacts.org/api/v2/product"

HEADERS = {
    "User-Agent": "BioDose/1.0"
}


def fetch_product(barcode):
    url = f"{BASE_URL}/{barcode}.json"

    try:
        response = requests.get(
            url,
            headers=HEADERS,
            timeout=10,
        )

        response.raise_for_status()

        data = response.json()

        if data.get("status") != 1:
            app_logger.error("Product not found")
            return None

        product = data.get("product", {})

        return {
            "barcode": barcode,
            "product_name": product.get("product_name", "Unknown"),
            "brand": product.get("brands", "Unknown"),
            "ingredients_text": product.get("ingredients_text", ""),
            "additives_tags": product.get("additives_tags", []),
            "additives_count": product.get("additives_n", 0),
            "additives_names": product.get("additives_en", ""),
        }

    except Exception as e:
        app_logger.error(str(e))
        return None