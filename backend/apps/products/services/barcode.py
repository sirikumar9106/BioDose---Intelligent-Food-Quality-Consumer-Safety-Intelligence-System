import requests
import numpy as np
from utils.logger import app_logger

BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
HEADERS = {"User-Agent": "BioDose/1.0 (food safety app)"}


def _parse_nutriments(nutriments: dict) -> dict:
    """Extract standardised per-100g nutritional values from OpenFoodFacts nutriments dict."""
    def safe(key, alt_key=None):
        val = nutriments.get(key) or (nutriments.get(alt_key) if alt_key else None)
        try:
            return round(float(val), 2) if val is not None else None
        except (ValueError, TypeError):
            return None

    return {
        "energy_kcal":       safe("energy-kcal_100g", "energy_100g"),
        "fat_g":             safe("fat_100g"),
        "saturated_fat_g":   safe("saturated-fat_100g"),
        "carbohydrates_g":   safe("carbohydrates_100g"),
        "sugars_g":          safe("sugars_100g"),
        "fiber_g":           safe("fiber_100g"),
        "proteins_g":        safe("proteins_100g"),
        "salt_g":            safe("salt_100g"),
        "sodium_mg":         safe("sodium_100g"),   # OpenFoodFacts returns in g, multiply ×1000
    }


def fetch_product(barcode: str) -> dict | None:
    """
    Fetches full product data from OpenFoodFacts API v2.
    Returns a unified dict with additive info + full nutritional breakdown,
    or None if the product is not found.
    """
    url = f"{BASE_URL}/{barcode}.json"

    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("status") != 1:
            app_logger.warning(f"Product not found for barcode: {barcode}")
            return None

        p = data.get("product", {})
        nutriments = p.get("nutriments", {})
        nutrition = _parse_nutriments(nutriments)

        # Convert sodium from g → mg if present
        if nutrition.get("sodium_mg") is not None:
            nutrition["sodium_mg"] = round(nutrition["sodium_mg"] * 1000, 1)

        return {
            # ── Identification ──────────────────────────────────────────
            "barcode":           barcode,
            "product_name":      p.get("product_name") or p.get("product_name_en") or "Unknown",
            "brand":             p.get("brands", "Unknown"),
            "quantity":          p.get("quantity", ""),
            "serving_size":      p.get("serving_size", ""),
            "image_url":         p.get("image_url", ""),
            "categories":        p.get("categories", ""),

            # ── Quality scores ──────────────────────────────────────────
            "nutriscore_grade":  p.get("nutriscore_grade", "").upper() or None,
            "nova_group":        p.get("nova_group") or None,
            "ecoscore_grade":    p.get("ecoscore_grade", "").upper() or None,

            # ── Additive data ───────────────────────────────────────────
            "ingredients_text":  p.get("ingredients_text", ""),
            "additives_tags":    p.get("additives_tags", []),
            "additives_count":   p.get("additives_n", 0),

            # ── Nutritional breakdown (per 100 g) ───────────────────────
            "nutrition_per_100g": nutrition,
        }

    except requests.RequestException as exc:
        app_logger.error(f"OpenFoodFacts request failed for {barcode}: {exc}")
        return None
    except Exception as exc:
        app_logger.error(f"fetch_product unexpected error for {barcode}: {exc}")
        return None


def gradient_variance(image_crop: np.ndarray) -> float:
    """
    Computes the variance of the Sobel gradient magnitude of a cropped image region.
    
    Args:
        image_crop (np.ndarray): The cropped image region (grayscale or color).
        
    Returns:
        float: The variance of the gradient magnitude.
    """
    import cv2
    import numpy as np
    
    if len(image_crop.shape) == 3:
        gray = cv2.cvtColor(image_crop, cv2.COLOR_BGR2GRAY)
    else:
        gray = image_crop
        
    sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobelx**2 + sobely**2)
    return float(np.var(grad_mag))


def load_yolo_model() -> "YOLO":
    """
    Ensures that YOLO weights are cached at ml/models/barcode_yolo.pt.
    Downloads them if missing, first trying the user-requested repo
    'hf://arnabdhar/YOLOv8-nano-barcode', falling back to
    'Piero2411/YOLOV8s-Barcode-Detection' if the repository is not found/accessible.
    """
    import os
    import shutil
    from ultralytics import YOLO
    from huggingface_hub import hf_hub_download
    from utils.constants import BASE_DIR

    # We try BASE_DIR.parent (workspace root) first, then BASE_DIR (backend root)
    yolo_dir = os.path.join(BASE_DIR.parent, "ml", "models")
    if not os.path.isdir(yolo_dir):
        yolo_dir = os.path.join(BASE_DIR, "ml", "models")
    os.makedirs(yolo_dir, exist_ok=True)

    yolo_path = os.path.join(yolo_dir, "barcode_yolo.pt")

    if os.path.exists(yolo_path):
        return YOLO(yolo_path)

    # 1. Try to download arnabdhar/YOLOv8-nano-barcode
    try:
        app_logger.info("Attempting to load YOLOv8 barcode model from arnabdhar/YOLOv8-nano-barcode")
        model = YOLO("hf://arnabdhar/YOLOv8-nano-barcode")
        if getattr(model, "ckpt_path", None) and os.path.exists(model.ckpt_path):
            shutil.copy(model.ckpt_path, yolo_path)
            app_logger.info(f"YOLO model weights cached to {yolo_path}")
        return model
    except Exception as e:
        app_logger.warning(f"Could not load model hf://arnabdhar/YOLOv8-nano-barcode: {e}. Falling back to Piero2411/YOLOV8s-Barcode-Detection...")
        
        # 2. Fallback to Piero2411/YOLOV8s-Barcode-Detection
        try:
            downloaded_path = hf_hub_download(
                repo_id="Piero2411/YOLOV8s-Barcode-Detection",
                filename="YOLOV8s_Barcode_Detection.pt"
            )
            shutil.copy(downloaded_path, yolo_path)
            app_logger.info(f"YOLO model weights cached to {yolo_path} from fallback repository")
            return YOLO(yolo_path)
        except Exception as err:
            app_logger.error(f"Failed to download fallback YOLO model: {err}")
            raise err


def load_sam2_model():
    """
    Ensures that SAM2-small weights are cached at ml/models/sam2_hiera_small.pt.
    Downloads them using huggingface_hub from Meta's official repository if missing.
    Returns the loaded SAM2 model and Automatic Mask Generator.
    """
    import os
    import torch
    from sam2.build_sam import build_sam2
    from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator
    from huggingface_hub import hf_hub_download
    from utils.constants import BASE_DIR

    # We try BASE_DIR.parent (workspace root) first, then BASE_DIR (backend root)
    models_dir = os.path.join(BASE_DIR.parent, "ml", "models")
    if not os.path.isdir(models_dir):
        models_dir = os.path.join(BASE_DIR, "ml", "models")
    os.makedirs(models_dir, exist_ok=True)

    sam2_checkpoint = os.path.join(models_dir, "sam2_hiera_small.pt")

    if not os.path.exists(sam2_checkpoint):
        app_logger.info("Downloading SAM2-small model weights from Meta's Hugging Face repository...")
        try:
            hf_hub_download(
                repo_id="facebook/sam2-hiera-small",
                filename="sam2_hiera_small.pt",
                local_dir=models_dir
            )
            app_logger.info(f"SAM2-small weights successfully downloaded to {sam2_checkpoint}")
        except Exception as e:
            app_logger.error(f"Failed to download SAM2-small weights: {e}")
            raise e

    # Build PyTorch model
    device = "cuda" if torch.cuda.is_available() else "cpu"
    try:
        model = build_sam2("sam2_hiera_s.yaml", sam2_checkpoint, device=device)
        # We set points_per_side=8 and crop_n_layers=0 to make inference fast on CPU
        generator = SAM2AutomaticMaskGenerator(model, points_per_side=8, crop_n_layers=0)
        return model, generator
    except Exception as e:
        app_logger.error(f"Failed to load native PyTorch SAM2 model: {e}")
        raise e


def detect_barcode(image_input) -> dict:
    """
    Detects and decodes a barcode from an image using a four-stage cascade pipeline.
    The function runs with a 3-second timeout across all stages.
    
    Args:
        image_input (str or np.ndarray): File path of the image or the image as a numpy array.
        
    Returns:
        dict: A dictionary containing success status, decoded barcode, and method.
    """
    import threading
    import queue
    
    res_queue = queue.Queue()
    
    def worker():
        try:
            res = _run_cascade_pipeline(image_input)
            res_queue.put(res)
        except Exception as e:
            res_queue.put({
                "success": False,
                "message": f"Pipeline error: {str(e)}"
            })
            
    t = threading.Thread(target=worker)
    t.daemon = True
    t.start()
    
    try:
        return res_queue.get(timeout=3.0)
    except queue.Empty:
        return {
            "success": False,
            "message": "Barcode could not be detected. Please ensure the barcode is visible and retry with better lighting."
        }


def _run_cascade_pipeline(image_input) -> dict:
    """
    Internal runner for the four-stage cascade barcode decoding pipeline.
    
    Args:
        image_input (str or np.ndarray): File path of the image or the image as a numpy array.
        
    Returns:
        dict: A dictionary containing success status, decoded barcode, and method.
    """
    import cv2
    import numpy as np
    import os
    import zxingcpp
    from utils.constants import BASE_DIR
    
    # 1. Load the image
    if isinstance(image_input, str):
        try:
            img = cv2.imdecode(np.fromfile(image_input, dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            img = cv2.imread(image_input)
    elif isinstance(image_input, np.ndarray):
        img = image_input.copy()
    else:
        # Check if it is a PIL Image or custom file upload from Django
        try:
            # Try loading via PIL if it's a file-like object
            from PIL import Image
            pil_img = Image.open(image_input).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            return {"success": False, "message": "Invalid image input type."}
        
    if img is None:
        return {"success": False, "message": "Failed to load image."}
        
    # Ensure color format for OpenCV operations
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # ────────────────────────────────────────────────────────────────────────
    # STAGE 1: Contrast normalisation (CLAHE) + Gaussian Blur
    # ────────────────────────────────────────────────────────────────────────
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    clahe_img = clahe.apply(gray)
    blurred = cv2.GaussianBlur(clahe_img, (3, 3), 0)
    
    # Verification check: Check if zxingcpp can be imported
    zxing_available = False
    try:
        import zxingcpp
        zxing_available = True
    except ImportError as e:
        app_logger.error(f"Stage 1 skipped: zxingcpp is not available. Error: {e}")
        
    if zxing_available:
        try:
            results = zxingcpp.read_barcodes(blurred)
            if results:
                valid = [r for r in results if r.valid and r.text]
                if valid:
                    return {"success": True, "barcode": valid[0].text, "method": "stage1"}
        except Exception as e:
            app_logger.warning(f"Stage 1 inference failed: {e}")
        
    # ────────────────────────────────────────────────────────────────────────
    # STAGE 2: OpenCV BarcodeDetector detect and perspective warp
    # ────────────────────────────────────────────────────────────────────────
    # Verification check: Check if cv2.barcode.BarcodeDetector is available
    detector_available = False
    try:
        if hasattr(cv2, "barcode") and hasattr(cv2.barcode, "BarcodeDetector"):
            detector_available = True
    except Exception:
        pass

    if detector_available:
        try:
            detector = cv2.barcode.BarcodeDetector()
            retval, decoded_info, decoded_type, points = detector.detectAndDecodeWithPoints(clahe_img)
            
            if points is not None and len(points) > 0:
                pts = points[0].astype(np.float32)
                rect = np.zeros((4, 2), dtype=np.float32)
                s = pts.sum(axis=1)
                rect[0] = pts[np.argmin(s)]
                rect[2] = pts[np.argmax(s)]
                
                diff = np.diff(pts, axis=1).flatten()
                rect[1] = pts[np.argmin(diff)]
                rect[3] = pts[np.argmax(diff)]
                
                width_a = np.sqrt(((rect[2][0] - rect[3][0]) ** 2) + ((rect[2][1] - rect[3][1]) ** 2))
                width_b = np.sqrt(((rect[1][0] - rect[0][0]) ** 2) + ((rect[1][1] - rect[0][1]) ** 2))
                max_width = max(int(width_a), int(width_b))
                
                height_a = np.sqrt(((rect[1][0] - rect[2][0]) ** 2) + ((rect[1][1] - rect[2][1]) ** 2))
                height_b = np.sqrt(((rect[0][0] - rect[3][0]) ** 2) + ((rect[0][1] - rect[3][1]) ** 2))
                max_height = max(int(height_a), int(height_b))
                
                if max_width > 0 and max_height > 0:
                    dst = np.array([
                        [0, 0],
                        [max_width - 1, 0],
                        [max_width - 1, max_height - 1],
                        [0, max_height - 1]
                    ], dtype=np.float32)
                    
                    M = cv2.getPerspectiveTransform(rect, dst)
                    rectified_crop = cv2.warpPerspective(clahe_img, M, (max_width, max_height))
                    
                    if zxing_available:
                        results = zxingcpp.read_barcodes(rectified_crop)
                        if results:
                            valid = [r for r in results if r.valid and r.text]
                            if valid:
                                return {"success": True, "barcode": valid[0].text, "method": "stage2"}
        except Exception as e:
            app_logger.warning(f"Stage 2 inference failed: {e}")

    # ────────────────────────────────────────────────────────────────────────
    # STAGE 3: YOLOv8-nano Crop and Rectify
    # ────────────────────────────────────────────────────────────────────────
    try:
        # Verification check: Check if YOLO model can be loaded
        yolo_model = load_yolo_model()
        
        yolo_res = yolo_model(img, verbose=False)
        if yolo_res and len(yolo_res) > 0:
            boxes = yolo_res[0].boxes
            if boxes is not None and len(boxes) > 0:
                for box in boxes:
                    xyxy = box.xyxy[0].cpu().numpy()
                    xmin, ymin, xmax, ymax = map(int, xyxy)
                    
                    rect = np.array([
                        [xmin, ymin],
                        [xmax, ymin],
                        [xmax, ymax],
                        [xmin, ymax]
                    ], dtype=np.float32)
                    
                    max_width = xmax - xmin
                    max_height = ymax - ymin
                    
                    if max_width > 0 and max_height > 0:
                        dst = np.array([
                            [0, 0],
                            [max_width - 1, 0],
                            [max_width - 1, max_height - 1],
                            [0, max_height - 1]
                        ], dtype=np.float32)
                        
                        M = cv2.getPerspectiveTransform(rect, dst)
                        rectified_crop = cv2.warpPerspective(img, M, (max_width, max_height))
                        rectified_gray = cv2.cvtColor(rectified_crop, cv2.COLOR_BGR2GRAY)
                        
                        if zxing_available:
                            results_zx = zxingcpp.read_barcodes(rectified_gray)
                            if results_zx:
                                valid = [r for r in results_zx if r.valid and r.text]
                                if valid:
                                    return {"success": True, "barcode": valid[0].text, "method": "stage3"}
    except Exception as e:
        app_logger.warning(f"Stage 3 failed or skipped: {e}")

    # ────────────────────────────────────────────────────────────────────────
    # STAGE 4: SAM2-small PyTorch + PiecewiseAffineTransform
    # ────────────────────────────────────────────────────────────────────────
    try:
        # Verification check: Check if SAM2 model can be loaded
        sam2_model, sam2_generator = load_sam2_model()
        
        from skimage.transform import PiecewiseAffineTransform, warp
        
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        masks = sam2_generator.generate(img_rgb)
        
        if masks:
            best_variance = -1.0
            best_mask_info = None
            
            for mask_dict in masks:
                mask_bin = mask_dict["segmentation"].astype(np.uint8) * 255
                x, y, w_box, h_box = mask_dict["bbox"]
                if h_box == 0 or w_box == 0:
                    continue
                    
                aspect_ratio = w_box / float(h_box)
                if not (1.5 <= aspect_ratio <= 6.0):
                    continue
                    
                cropped_gray = gray[y:y+h_box, x:x+w_box]
                cropped_mask = mask_bin[y:y+h_box, x:x+w_box]
                
                variance = gradient_variance(cropped_gray)
                
                if variance > 500.0:
                    if variance > best_variance:
                        best_variance = variance
                        contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                        c = max(contours, key=cv2.contourArea) if contours else None
                        best_mask_info = {
                            "contour": c,
                            "bbox": (x, y, w_box, h_box),
                            "mask": mask_bin,
                            "cropped_mask": cropped_mask,
                            "cropped_gray": cropped_gray
                        }
                        
            if best_mask_info is not None:
                x, y, w_box, h_box = best_mask_info["bbox"]
                cropped_gray = best_mask_info["cropped_gray"]
                cropped_mask = best_mask_info["cropped_mask"]
                
                strip_w = w_box // 10
                warped_strips = []
                
                for i in range(10):
                    x_l = i * strip_w
                    x_r = min((i + 1) * strip_w, w_box - 1)
                    
                    active_l = np.where(cropped_mask[:, x_l] > 0)[0]
                    y_tl = np.min(active_l) if len(active_l) > 0 else 0
                    y_bl = np.max(active_l) if len(active_l) > 0 else h_box - 1
                    
                    active_r = np.where(cropped_mask[:, x_r] > 0)[0]
                    y_tr = np.min(active_r) if len(active_r) > 0 else 0
                    y_br = np.max(active_r) if len(active_r) > 0 else h_box - 1
                    
                    src_pts = np.array([
                        [i * strip_w, y_tl],
                        [x_r, y_tr],
                        [x_r, y_br],
                        [i * strip_w, y_bl]
                    ], dtype=np.float32)
                    
                    dst_pts = np.array([
                        [0, 0],
                        [strip_w, 0],
                        [strip_w, h_box],
                        [0, h_box]
                    ], dtype=np.float32)
                    
                    y_min_s = max(0, int(min(y_tl, y_tr)))
                    y_max_s = min(h_box, int(max(y_bl, y_br) + 1))
                    x_min_s = int(i * strip_w)
                    x_max_s = min(int((i + 1) * strip_w), w_box)
                    
                    strip_img = cropped_gray[y_min_s:y_max_s, x_min_s:x_max_s]
                    if strip_img.size == 0:
                        warped_strip = cv2.resize(cropped_gray[:, x_min_s:x_max_s], (strip_w, h_box))
                    else:
                        src_pts_local = src_pts.copy()
                        src_pts_local[:, 0] -= x_min_s
                        src_pts_local[:, 1] -= y_min_s
                        
                        tform = PiecewiseAffineTransform()
                        tform.estimate(dst_pts, src_pts_local)
                        
                        warped = warp(strip_img, tform, output_shape=(h_box, strip_w))
                        warped_strip = (warped * 255).astype(np.uint8)
                        
                    warped_strips.append(warped_strip)
                    
                rectified_img = np.hstack(warped_strips)
                
                if zxing_available:
                    results_zx = zxingcpp.read_barcodes(rectified_img)
                    if results_zx:
                        valid = [r for r in results_zx if r.valid and r.text]
                        if valid:
                            return {"success": True, "barcode": valid[0].text, "method": "stage4"}
    except Exception as e:
        app_logger.warning(f"Stage 4 failed or skipped: {e}")

    return {
        "success": False,
        "message": "Barcode could not be detected. Please ensure the barcode is visible and retry with better lighting."
    }