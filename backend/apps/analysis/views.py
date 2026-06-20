import threading
from utils.condition_registry import conditions_to_mdc_string
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status


def _write_scan_log(user_age: int, condition_names: list, product_id: str, confidence_score: float):
    """Runs in a background thread — never blocks the API response."""
    try:
        from models.analysis_models import ScanLog

        mdc_ids = conditions_to_mdc_string(condition_names)
        num_conditions = len([m for m in mdc_ids.split(",") if m]) if mdc_ids else 0

        ScanLog.objects.create(
            user_age=int(user_age) if user_age else 0,
            num_conditions=num_conditions,
            condition_ids=mdc_ids,
            product_id=str(product_id)[:100],
            confidence_score=round(float(confidence_score), 3),
        )
    except Exception as exc:
        print(f"[ScanLog] write failed: {exc}")


def log_scan(user_age: int, condition_names: list, product_id: str, confidence_score: float):
    """
    Non-blocking scan logger. Call after every successful barcode analysis.

    Args:
        user_age: integer age (0 if unknown / guest)
        condition_names: list of display-name strings e.g. ["Diabetes Type 2", "Asthma"]
        product_id: barcode string
        confidence_score: float 0.0–1.0
    """
    thread = threading.Thread(
        target=_write_scan_log,
        args=(user_age, condition_names, product_id, confidence_score),
        daemon=True,
    )
    thread.start()


class ScanHistoryView(APIView):
    """GET /api/v1/scan-history/ — Returns the last 5 scans for the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from models.analysis_models import UserScanHistory
        history = UserScanHistory.objects.filter(user=request.user)[:5]
        data = [
            {
                "id": str(item.id),
                "barcode": item.barcode,
                "product_name": item.product_name,
                "brand": item.brand,
                "risk_label": item.risk_label,
                "risk_score": float(item.risk_score),
                "scanned_at": item.scanned_at.isoformat(),
                "result_payload": item.result_payload,
            }
            for item in history
        ]
        return Response({"history": data})


class ChatbotView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import os
        import requests
        from models.analysis_models import UserChatContext
        from apps.products.services.barcode import fetch_product
        from utils.condition_registry import mdc_to_display
        from utils.web_search import free_web_search

        user_message = request.data.get("message", "").strip()
        barcode = request.data.get("barcode", "").strip()

        if not user_message:
            return Response({"error": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create UserChatContext
        chat_context, created = UserChatContext.objects.get_or_create(user=request.user)

        # Handle barcode context
        if barcode:
            chat_context.temp_barcode = barcode
            chat_context.save()
        elif "barcode" in request.data:
            # Explicit empty barcode sent by client: clear the session context barcode
            chat_context.temp_barcode = ""
            chat_context.save()
            barcode = ""
        else:
            barcode = chat_context.temp_barcode

        product_info = None
        if barcode:
            # Try fetching product context
            product = fetch_product(barcode)
            if product:
                product_info = {
                    "product_name": product.get("product_name", "Unknown Product"),
                    "brand": product.get("brand", ""),
                    "ingredients": product.get("ingredients_text", ""),
                    "additives_count": product.get("additives_count", 0),
                    "nutrition": product.get("nutrition_per_100g", {})
                }

        # Retrieve user profile info
        user_age = request.user.age or 0
        user_conditions = request.user.health_conditions or []
        user_conditions_str = ", ".join([mdc_to_display(c) for c in user_conditions]) if user_conditions else "No health conditions registered"

        msg_lower = user_message.lower()

        # Pleasantry/Coffee check using whole-word matching
        msg_words = set(msg_lower.replace("?", "").replace(".", "").replace("!", "").replace(",", "").split())
        pleasantry_reply = None
        
        is_pure_greeting = len(msg_words) <= 3 and any(greet in msg_words for greet in ["hi", "hello", "hey", "hola", "yo", "morning", "afternoon"])
        is_pure_howareyou = len(msg_words) <= 5 and any(phrase in msg_lower for phrase in ["how are you", "how's it going", "how you doing", "how are you doing"])

        if "coffee" in msg_words and len(msg_words) <= 5:
            pleasantry_reply = "I just refreshed my circuits! As an AI, I cannot consume physical coffee. Let's get back to your dietary health. How can I help you today?"
        elif is_pure_greeting or is_pure_howareyou:
            pleasantry_reply = "Hello! I am MedSensei, your medical and food-safety assistant. How can I help you today?"

        # Condition lookup check - flexible root checks
        profile_query_reply = None
        is_profile_query = any(k in msg_lower for k in ["condition", "allerg", "profile", "what should i avoid", "food should i not eat", "what to avoid", "risk for me"])
        if is_profile_query:
            profile_query_reply = f"Based on your locked profile, you have the following registered conditions: {user_conditions_str}. "
            if user_conditions:
                profile_query_reply += "You should be cautious and avoid foods containing ingredients/additives flagged for these conditions. How can I assist you further with this?"
            else:
                profile_query_reply += "Since you have no registered conditions, general food safety guidelines apply. How can I help?"

        # Fetch free web search results for medical/safety queries
        search_context = ""
        web_results = []
        if not pleasantry_reply and not profile_query_reply:
            web_results = free_web_search(user_message)
            if web_results:
                search_context = "\n".join([
                    f"- Source: {res['title']} ({res['link']}): {res['snippet']}"
                    for res in web_results
                ])

        # Prepare system prompt
        system_prompt = f"""You are MedSensei, a professional, highly curated and friendly medical, dietary, and food safety chatbot for the BioDose app.
Your strict rules:
1. ONLY discuss medical, health, diet, food ingredients, food additives, allergies, and safety topics.
2. Accept normal daily pleasantries, but steer the conversation back to medical topics immediately.
3. Strictly decline any non-medical/non-dietary tasks (e.g. math homework, programming help, general history, sports) with a polite reminder of your role.
4. Keep the user's details in mind: Age: {user_age}, Registered conditions: {user_conditions_str}.
5. If you need to ask clarifying questions, provide 2–4 quick reply choices using the format [OPTIONS: Choice1, Choice2] (replace Choice1 and Choice2 with actual context-specific options like [OPTIONS: Yes, No] or [OPTIONS: Mild, Severe, None] depending on your question). NEVER output the literal word 'Opt1' or 'Opt2'—always use context-relevant option text.
6. If the user confirms a condition, suggest adding it to their profile by outputting the tag: [SUGGEST_CONDITION: MDC_ID] where MDC_ID is the matching code. Crucial: NEVER suggest, recommend, or output [SUGGEST_CONDITION: MDC_ID] for any condition that is ALREADY in the user's registered conditions list ({user_conditions_str}). Only suggest new/unregistered conditions. Codes:
- Diabetes Type 2: MDC01
- Hypertension: MDC02
- Asthma: MDC03
- Celiac Disease: MDC04
- IBS: MDC05
- Chronic Kidney Disease: MDC06
- Liver Disease: MDC07
- Thyroid Disorders: MDC08
- Autoimmune Conditions: MDC09
- ADHD: MDC10
- Heart Disease: MDC11
- Pregnancy: MDC12
- Lactation: MDC13
- Peanut Allergy: MDC17
- Shellfish Allergy: MDC18
- Dairy Allergy: MDC19
- Gluten Sensitivity: MDC20
- Soy Allergy: MDC21
7. If a product context (barcode/ingredients) is active, restrict your advice to how that product affects their health and conditions. Product: {product_info}.
8. Rely strictly on the following curated web search results to answer the user query accurately without making up facts. Search Context: {search_context}.
"""

        # Update chat history in context
        history = chat_context.chat_history or []
        trimmed_history = history[-10:]

        bot_reply = None
        groq_failed = False
        hf_failed = False
        error_reason = None

        if pleasantry_reply:
            bot_reply = pleasantry_reply
        elif profile_query_reply:
            bot_reply = profile_query_reply
        else:
            # 1. Attempt Groq API (Primary choice, Jio DNS friendly, highly conversational)
            groq_api_key = os.environ.get("GROQ_API_KEY")
            if groq_api_key:
                try:
                    # Print diagnostics (safe first 6 chars of key)
                    print(f"[Chatbot] GROQ_API_KEY found. Length: {len(groq_api_key)}, starts with: {groq_api_key[:6]}...")
                    
                    groq_messages = [{"role": "system", "content": system_prompt}]
                    for msg in trimmed_history:
                        groq_messages.append({
                            "role": msg.get("role", "user"),
                            "content": msg.get("content", "")
                        })
                    groq_messages.append({"role": "user", "content": user_message})

                    headers = {
                        "Authorization": f"Bearer {groq_api_key}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": "llama-3.1-8b-instant",
                        "messages": groq_messages,
                        "temperature": 0.2,
                        "max_tokens": 256
                    }

                    response = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=payload,
                        timeout=15
                    )
                    if response.ok:
                        res_data = response.json()
                        bot_reply = res_data["choices"][0]["message"]["content"].strip()
                        print("[Chatbot] Groq request succeeded.")
                    else:
                        groq_failed = True
                        print(f"[Chatbot] Groq API returned HTTP {response.status_code}: {response.text}")
                except Exception as e:
                    groq_failed = True
                    print(f"[Chatbot] Groq connection failure: {e}")
            else:
                groq_failed = True
                print("[Chatbot] GROQ_API_KEY is not set or empty in environment!")

            # 2. Attempt Hugging Face (Secondary backup choice)
            if groq_failed and not bot_reply:
                try:
                    formatted_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
                    for msg in trimmed_history:
                        role = msg.get("role")
                        content = msg.get("content")
                        formatted_prompt += f"<|im_start|>{role}\n{content}<|im_end|>\n"
                    formatted_prompt += f"<|im_start|>user\n{user_message}<|im_end|>\n<|im_start|>assistant\n"
                    
                    headers = {}
                    hf_token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_API_KEY")
                    if hf_token:
                        headers["Authorization"] = f"Bearer {hf_token}"
                        
                    payload = {
                        "inputs": formatted_prompt,
                        "parameters": {
                            "max_new_tokens": 256,
                            "temperature": 0.2,
                            "return_full_text": False
                        },
                        "options": {
                            "wait_for_model": True
                        }
                    }
                    
                    response = requests.post(
                        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct",
                        headers=headers,
                        json=payload,
                        timeout=35
                    )
                    if response.ok:
                        res_data = response.json()
                        if isinstance(res_data, list) and len(res_data) > 0:
                            text = res_data[0].get("generated_text", "")
                            if "<|im_end|>" in text:
                                text = text.split("<|im_end|>")[0]
                            bot_reply = text.strip()
                        elif isinstance(res_data, dict) and "generated_text" in res_data:
                            text = res_data["generated_text"]
                            if "<|im_end|>" in text:
                                text = text.split("<|im_end|>")[0]
                            bot_reply = text.strip()
                    else:
                        hf_failed = True
                        error_reason = f"Hugging Face Inference API returned HTTP {response.status_code}: {response.text}"
                except requests.exceptions.Timeout:
                    hf_failed = True
                    error_reason = "Hugging Face Inference API timed out after 35 seconds."
                except Exception as e:
                    print(f"[Chatbot] HF API call error: {e}")
                    hf_failed = True
                    error_reason = f"Connection error or network failure: {str(e)}"

        # Log Hugging Face error but do not raise a hard gateway crash. Fall back to local rules.
        if hf_failed and error_reason:
            print(f"[Chatbot View] Hugging Face Inference API error: {error_reason}")

        # Fallback to local rule-based expert parser
        if not bot_reply:
            # Check for specific quick replies
            if msg_lower == "yes" or msg_lower == "dairy allergy":
                last_assistant_msg = next((m["content"] for m in reversed(trimmed_history) if m["role"] == "assistant"), "")
                if "dairy" in last_assistant_msg.lower() or "milk" in last_assistant_msg.lower():
                    bot_reply = "Understood. I recommend adding Dairy Allergy to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC19]"
                else:
                    bot_reply = "Could you please specify which condition you would like to confirm?"
            elif msg_lower == "peanut allergy":
                bot_reply = "Understood. I recommend adding Peanut Allergy to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC17]"
            elif msg_lower == "shellfish allergy":
                bot_reply = "Understood. I recommend adding Shellfish Allergy to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC18]"
            elif msg_lower == "soy allergy":
                bot_reply = "Understood. I recommend adding Soy Allergy to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC21]"
            elif msg_lower == "gluten sensitivity":
                bot_reply = "Understood. I recommend adding Gluten Sensitivity to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC20]"
            elif msg_lower == "celiac disease":
                bot_reply = "Understood. I recommend adding Celiac Disease to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC04]"
            elif msg_lower == "ibs":
                bot_reply = "Understood. I recommend adding IBS to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC05]"
            elif msg_lower == "diabetes":
                bot_reply = "Understood. I recommend adding Diabetes Type 2 to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC01]"
            elif msg_lower == "hypertension":
                bot_reply = "Understood. I recommend adding Hypertension to your health profile. Please confirm this change. [SUGGEST_CONDITION: MDC02]"
            # Keyword condition detection
            elif any(w in msg_lower for w in ["milk", "dairy", "lactose", "cheese"]):
                bot_reply = "I noticed you mentioned dairy or milk-related terms. Do you have a Dairy Allergy? [OPTIONS: Dairy Allergy, None]"
            elif any(w in msg_lower for w in ["peanut", "nut", "almonds", "cashew"]):
                bot_reply = "I noticed you mentioned nuts or peanuts. Do you have a Peanut Allergy? [OPTIONS: Peanut Allergy, None]"
            elif any(w in msg_lower for w in ["shrimp", "crab", "shellfish", "lobster"]):
                bot_reply = "I noticed you mentioned shellfish. Do you have a Shellfish Allergy? [OPTIONS: Shellfish Allergy, None]"
            elif any(w in msg_lower for w in ["soy", "tofu", "soybean"]):
                bot_reply = "I noticed you mentioned soy. Do you have a Soy Allergy? [OPTIONS: Soy Allergy, None]"
            elif any(w in msg_lower for w in ["gluten", "wheat", "celiac"]):
                bot_reply = "I noticed you mentioned gluten or wheat. Do you have Gluten Sensitivity or Celiac Disease? [OPTIONS: Gluten Sensitivity, Celiac Disease, None]"
            elif any(w in msg_lower for w in ["diabetes", "sugar", "insulin"]):
                bot_reply = "I noticed you mentioned diabetes or sugar. Do you have Diabetes Type 2? [OPTIONS: Diabetes, None]"
            elif any(w in msg_lower for w in ["hypertension", "salt", "blood pressure"]):
                bot_reply = "I noticed you mentioned high blood pressure or salt. Do you have Hypertension? [OPTIONS: Hypertension, None]"
            else:
                # Compile response from DDG search results
                if web_results:
                    snippets = " ".join([res["snippet"] for res in web_results[:3]])
                    bot_reply = f"Based on verified resources: {snippets} Let me know if you want to know more about this."
                elif product_info:
                    bot_reply = f"For the product {product_info['product_name']} ({product_info['brand']}), it contains {product_info['additives_count']} additives. Given your profile ({user_conditions_str}), please consult a doctor for personalized dietary advice. How else can I help?"
                else:
                    bot_reply = "As MedSensei, I'm here to answer your food safety, health, and dietary queries. Could you describe your symptoms, ingredients of concern, or health goals?"



        # Save to chat history
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": bot_reply})
        chat_context.chat_history = history
        chat_context.save()

        return Response({
            "message": bot_reply,
            "history": history
        })


class ChatbotConfirmConditionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from utils.condition_registry import CONDITION_REGISTRY, mdc_to_display
        from models.analysis_models import UserChatContext

        password = request.data.get("password", "")
        condition_id = request.data.get("condition_id", "").strip().upper()

        if not password or not condition_id:
            return Response({"error": "Password and condition_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        if condition_id not in CONDITION_REGISTRY:
            return Response({"error": "Invalid condition ID."}, status=status.HTTP_400_BAD_REQUEST)

        # Check password
        if not request.user.check_password(password):
            return Response({"error": "Invalid password. Access denied."}, status=status.HTTP_403_FORBIDDEN)

        # Update profile conditions if not already present
        conditions = request.user.health_conditions or []
        if condition_id not in conditions:
            conditions.append(condition_id)
            request.user.health_conditions = conditions
            request.user.save()

        # Update chatbot situation as well
        chat_context, created = UserChatContext.objects.get_or_create(user=request.user)
        situation = chat_context.situation or ""
        cond_display = mdc_to_display(condition_id)
        if cond_display not in situation:
            if situation:
                situation += f", {cond_display}"
            else:
                situation = cond_display
            chat_context.situation = situation
            chat_context.save()

        return Response({
            "success": True,
            "message": f"Successfully added {cond_display} to your profile.",
            "health_conditions": conditions
        })
