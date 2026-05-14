import json
import time
import requests


HEADERS = {
    "User-Agent": "BioDose/1.0"
}

BASE_URL = "https://world.openfoodfacts.org/api/v2/product"


BARCODES = [

    # 429 RETRIES
    "7622201809188",
    "5206674101004",
    "0089686130027",
    "4056489354918",
    "0034023754541",
    "5010663227204",
    "8901499008176",
    "20159917",
    "5000112676206",
    "3596710348251",
    "0072080400025",
    "3017620401473",
    "7613035352926",
    "3155251205218",
    "5010194002239",
    "0011213176512",
    "8718114601014",
    "0011213193489",
    "0089686170726",
    "7622210449283",

    # NEW VERIFIED PRODUCTS
    "5449000008046",
    "3017620425035",
    "8000500037560",
    "7613036249430",
    "7622300443709",
    "3017760422003",
    "7622210959287",
    "5000159484695",
    "7622210711441",
    "3045140105507",
]


def fetch_product(barcode):
    url = f"{BASE_URL}/{barcode}.json"

    retries = 3

    for attempt in range(retries):

        try:
            response = requests.get(
                url,
                headers=HEADERS,
                timeout=15,
            )

            response.raise_for_status()

            data = response.json()

            if data.get("status") != 1:
                print(f"[NOT FOUND] {barcode}")
                return None

            product = data.get("product", {})

            additives = product.get(
                "additives_tags",
                [],
            )

            additives = [
                additive.replace("en:", "").upper()
                for additive in additives
            ]

            sample = {
                "barcode": barcode,
                "product_name": product.get(
                    "product_name",
                    "Unknown",
                ),
                "brand": product.get(
                    "brands",
                    "Unknown",
                ),
                "category": product.get(
                    "categories",
                    "",
                ),
                "ingredients_text": product.get(
                    "ingredients_text",
                    "",
                ),
                "additives": additives,
                "additive_count": len(additives),
            }

            print(
                f"[SUCCESS] "
                f"{barcode} "
                f"-> "
                f"{sample['product_name']}"
            )

            return sample

        except requests.exceptions.HTTPError as e:

            status = e.response.status_code

            if status == 429:
                wait_time = 5 + (attempt * 3)

                print(
                    f"[RATE LIMITED] "
                    f"{barcode} "
                    f"retrying in {wait_time}s"
                )

                time.sleep(wait_time)

                continue

            print(f"[ERROR] {barcode} -> {e}")
            return None

        except Exception as e:
            print(f"[ERROR] {barcode} -> {e}")
            return None

    return None


def load_existing_samples():
    try:
        with open(
            "data/product_samples.json",
            "r",
            encoding="utf-8",
        ) as file:

            return json.load(file)

    except:
        return []


def main():

    existing_samples = load_existing_samples()

    existing_barcodes = {
        item["barcode"]
        for item in existing_samples
    }

    samples = existing_samples.copy()

    for barcode in BARCODES:

        if barcode in existing_barcodes:
            continue

        result = fetch_product(barcode)

        if result:
            samples.append(result)

        time.sleep(2)

    with open(
        "data/product_samples.json",
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            samples,
            file,
            indent=4,
            ensure_ascii=False,
        )

    print()
    print(
        f"TOTAL PRODUCTS: {len(samples)}"
    )


if __name__ == "__main__":
    main()