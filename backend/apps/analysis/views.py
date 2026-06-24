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
        import re
        import requests
        from models.analysis_models import UserChatContext
        from apps.products.services.barcode import fetch_product
        from utils.condition_registry import mdc_to_display
        from utils.web_search import free_web_search

        user_message = request.data.get("message", "").strip()
        barcode = request.data.get("barcode", "").strip()
        clear_history = request.data.get("clear_history", False)

        # ── Scan-history context isolation (called from history page) ────────────
        # Frontend sends clear_history=True when navigating from scan history to
        # a fresh chat about a different product. Wipe the stored session and return.
        if clear_history:
            chat_context, _ = UserChatContext.objects.get_or_create(user=request.user)
            chat_context.chat_history = []
            chat_context.temp_barcode = barcode
            chat_context.save()
            return Response({"status": "cleared", "message": "Chat history cleared."})

        if not user_message:
            return Response({"error": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Get or create UserChatContext
        chat_context, created = UserChatContext.objects.get_or_create(user=request.user)

        # ── Barcode context isolation ────────────────────────────────────────────
        # If the incoming barcode is different from the one stored in the session,
        # this is a NEW product context. Clear the chat history so conversations
        # about the old product NEVER bleed into the new product's Groq context.
        incoming_barcode = barcode
        stored_barcode = chat_context.temp_barcode or ""

        if incoming_barcode and incoming_barcode != stored_barcode:
            # New product — wipe history to prevent cross-product context leaking
            chat_context.chat_history = []
            chat_context.temp_barcode = incoming_barcode
            chat_context.save()
        elif not incoming_barcode and "barcode" in request.data:
            # Explicit empty barcode from client: clear both barcode and history
            chat_context.chat_history = []
            chat_context.temp_barcode = ""
            chat_context.save()
            barcode = ""
        elif not incoming_barcode:
            # No barcode sent at all — reuse whatever was stored
            barcode = stored_barcode

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

        # ── Pure greeting shortcut ───────────────────────────────────────────────
        msg_words = set(msg_lower.replace("?", "").replace(".", "").replace("!", "").replace(",", "").split())
        pleasantry_reply = None
        is_pure_greeting = len(msg_words) <= 3 and any(g in msg_words for g in ["hi", "hello", "hey", "hola", "yo", "morning", "afternoon"])
        is_pure_howareyou = len(msg_words) <= 5 and any(p in msg_lower for p in ["how are you", "how's it going", "how you doing", "how are you doing"])
        if "coffee" in msg_words and len(msg_words) <= 5:
            pleasantry_reply = "I just refreshed my circuits! As an AI I cannot consume coffee, but I am fully charged to help with your dietary and health questions. What would you like to know?"
        elif is_pure_greeting or is_pure_howareyou:
            pleasantry_reply = "Hello! I am MedSensei, your medical and food-safety assistant. How can I help you today?"

        # ── Load chat history early (needed for streak detection) ───────────────
        history = chat_context.chat_history or []
        trimmed_history = history[-10:]

        # ── Health-anchor vocabulary ─────────────────────────────────────────────
        # Any message containing even ONE of these words is treated as health-related
        # and goes straight to Groq regardless of other words present.
        HEALTH_ANCHORS = {
            "diet", "food", "eat", "eating", "meal", "drink", "ingredient",
            "additive", "allerg", "allergy", "allergic", "condition", "medicine",
            "drug", "supplement", "calorie", "nutrition", "nutrient", "vitamin",
            "mineral", "protein", "fat", "carb", "sugar", "sodium", "salt",
            "pressure", "blood", "heart", "kidney", "liver", "thyroid", "lung",
            "gut", "bowel", "asthma", "diabetes", "health", "healthy", "safe",
            "safety", "risk", "harmful", "symptom", "disease", "disorder",
            "product", "barcode", "scan", "pregnancy", "pregnant", "infant",
            "child", "elderly", "gluten", "lactose", "soy", "peanut", "shellfish",
            "dairy", "wheat", "ibs", "immune", "autoimmune", "adhd", "hypertension",
            "cholesterol", "iron", "calcium", "obesity", "weight", "digest",
            "digestive", "intolerance", "preservative", "colouring", "emulsifier",
            "flavour", "flavor", "organic", "processed", "fiber", "fibre",
            "carbohydrate", "glycemic", "toxin", "carcinogen", "e-number",
            "msg", "aspartame", "stevia", "sucrose", "fructose", "glucose",
            "omega", "fatty acid", "trans fat", "saturated", "antioxidant",
            "probiotic", "prebiotic", "enzyme", "medication", "prescription",
            "body", "metabol", "absorb", "nutrient", "hypo", "hyper",
        }

        # Signals that a message is likely purely off-topic
        OFFTOPIC_SIGNALS = [
            "cricket", "football", "soccer", "basketball", "tennis", "ipl",
            "movie", "film", "actor", "actress", "song", "music", "lyrics",
            "celebrity", "gaming", "valorant", "pubg", "fortnite", "minecraft",
            "stock market", "crypto", "bitcoin", "ethereum", "trading", "nifty",
            "sensex", "algebra", "geometry", "calculus", "differential equation",
            "politics", "election", "parliament", "president", "prime minister",
            "astronomy", "galaxy", "rocket", "spacecraft",
            "who won", "what is the score", "who is the president",
        ]

        msg_has_health = any(h in msg_lower for h in HEALTH_ANCHORS)
        msg_is_purely_offtopic = (
            not msg_has_health
            and not pleasantry_reply
            and any(s in msg_lower for s in OFFTOPIC_SIGNALS)
        )

        # ── Consecutive off-topic streak counter ─────────────────────────────────
        # Count how many of the most-recent user messages were ALSO purely off-topic
        # (no health anchor). The current message is not yet in history.
        offtopic_streak = 0
        if msg_is_purely_offtopic:
            for entry in reversed(trimmed_history):
                if entry.get("role") == "user":
                    prev = entry.get("content", "").lower()
                    if not any(h in prev for h in HEALTH_ANCHORS) and any(s in prev for s in OFFTOPIC_SIGNALS):
                        offtopic_streak += 1
                    else:
                        break
            offtopic_streak += 1  # count current message

        # Friendly nudge fires ONLY after 3 consecutive purely off-topic messages
        out_of_domain_nudge = None
        if offtopic_streak >= 3:
            out_of_domain_nudge = (
                "Hey, looks like we've drifted a little off the health trail! 😄 "
                "I'm MedSensei — food safety and medical conditions are my world. "
                "I'd love to help with anything on that front. "
                "Got a question about a product, ingredient, or your health profile?"
            )

        # ── Profile-query context enrichment ────────────────────────────────────
        # Detected when the user is asking about personal risk, conditions, or
        # product safety. Adds a structured block to the system prompt so Groq
        # explicitly references the user's conditions rather than giving generic info.
        is_profile_query = any(k in msg_lower for k in [
            "condition", "allerg", "profile", "what should i avoid",
            "food should i not eat", "what to avoid", "risk for me", "risky",
            "risk", "safe for me", "harmful", "avoid", "dangerous", "bad for me",
            "affect me", "my health", "i have", "my condition",
        ])
        profile_context_block = ""
        if is_profile_query or msg_has_health:
            profile_context_block = (
                f"\n\n=== USER HEALTH PROFILE ===\n"
                f"Age: {user_age}\n"
                f"Registered conditions / allergies: {user_conditions_str}\n"
                f"When answering, explicitly name which of these conditions are relevant "
                f"to the user's question and explain the mechanism in plain language. "
                f"Never give a generic answer when you have personal profile data."
            )

        # Emergency fallback text — only used when BOTH Groq and HF fail entirely
        profile_fallback_reply = None
        if user_conditions:
            profile_fallback_reply = (
                f"Your profile shows: {user_conditions_str}. "
                f"You should be mindful of ingredients and additives flagged for these conditions. "
                f"How can I assist you further?"
            )

        # ── Web search context ───────────────────────────────────────────────────
        # Run for all real queries. Results are passed to Groq as source material.
        search_context = ""
        web_results = []
        if not pleasantry_reply and not out_of_domain_nudge:
            web_results = free_web_search(user_message)
            if web_results:
                search_context = "\n".join([
                    f"- [{res['title']}] {res['snippet']} (source: {res['link']})"
                    for res in web_results
                ])

        # ── Product context block ────────────────────────────────────────────────
        product_context_block = ""
        if product_info:
            product_context_block = (
                f"\n\n=== ACTIVE PRODUCT CONTEXT ===\n"
                f"Name: {product_info.get('product_name', 'Unknown')}\n"
                f"Brand: {product_info.get('brand', 'Unknown')}\n"
                f"Ingredients text: {product_info.get('ingredients', 'Not available')}\n"
                f"Number of additives: {product_info.get('additives_count', 0)}\n"
                f"Nutrition per 100g: {product_info.get('nutrition', {})}\n"
                f"Ground your answer in these specifics. Explain how each relevant "
                f"ingredient or additive interacts with the user's registered conditions."
            )

        # ── Condition code reference ─────────────────────────────────────────────
        condition_code_ref = (
            "Diabetes Type 2→MDC01, Hypertension→MDC02, Asthma→MDC03, "
            "Celiac Disease→MDC04, IBS→MDC05, Chronic Kidney Disease→MDC06, "
            "Liver Disease→MDC07, Thyroid Disorders→MDC08, "
            "Autoimmune Conditions→MDC09, ADHD→MDC10, Heart Disease→MDC11, "
            "Pregnancy→MDC12, Lactation→MDC13, Peanut Allergy→MDC17, "
            "Shellfish Allergy→MDC18, Dairy Allergy→MDC19, "
            "Gluten Sensitivity→MDC20, Soy Allergy→MDC21"
        )

        # ── System prompt ────────────────────────────────────────────────────────
        system_prompt = f"""You are MedSensei, an expert, warm, and highly personalised \
medical, dietary, and food-safety assistant embedded in the BioDose app.

YOUR DOMAIN:
  • Food ingredients, additives, preservatives, and E-numbers
  • Nutritional values and dietary guidance
  • Health conditions, allergies, and their relation to food/products
  • Supplement and medicine safety as it relates to diet
  • Product-specific risk analysis based on the user's health profile

BEHAVIOUR RULES:
1. STAY IN DOMAIN — If the conversation touches health, food, or ingredients in ANY way, \
engage helpfully. Do NOT refuse just because a non-health word appears. \
If someone frames a health question with math analogies or casual language, \
laugh it off lightly and answer the underlying health question — the spirit matters more than the words.
   Only redirect if the user is clearly asking about something with ZERO health relevance \
(e.g. "solve this integral", "who won the cricket match"). Even then: one warm, brief \
redirect sentence is enough — never preachy.
2. GREETINGS — Warm and natural. Immediately offer relevant health assistance.
3. PERSONALISE — Always tailor answers to the user's specific conditions and age. \
Never give one-size-fits-all advice when profile data is available.
4. TONE — Friendly, knowledgeable, concise. Vary phrasing naturally every reply. \
Never sound robotic or copy-pasted.
5. QUICK REPLY OPTIONS — When clarification helps, offer 2–4 specific options: \
[OPTIONS: Choice1, Choice2]. Use real context words.
6. CONDITION SUGGESTIONS — This is the most sensitive feature of your system. Follow every
   sub-rule below with zero exceptions:

   a) NEVER SUGGEST based on minor or transient symptoms that anyone might experience
      occasionally: fever, cold, flu, cough, runny nose, body ache, headache, fatigue,
      tiredness, dizziness, stress, insomnia, mild nausea. These symptoms only inform
      dietary advice — they must NEVER lead to a [SUGGEST_CONDITION: ...] tag.
      If you see only these symptoms, give food-safety advice and move on.

   b) ONLY BEGIN diagnostic questioning after a PATTERN has built up over at least 4
      distinct user messages that collectively point to a specific, non-transient condition.
      A single message — no matter how alarming-sounding — is NEVER enough.
      Examples of patterns worth investigating: recurring allergic reactions tied to
      specific food groups across multiple messages, persistent digestive distress linked
      to particular ingredients over several turns, or the user explicitly stating they
      suspect they have a condition.

   c) DIAGNOSTIC QUESTIONING MODE — When a pattern qualifies under rule (b), do NOT
      immediately suggest. Instead, enter a step-by-step elimination questionnaire:
      - Ask ONE focused isolation question per reply using [OPTIONS: Yes, Mildly, No]
      - Design each question to eliminate one possible condition at a time
      - For allergy cases, isolate each allergen with a pure-form test question
        e.g. "Have you ever had a reaction after eating plain paneer with no other
        ingredients — no soy, no wheat, just fresh paneer?" [OPTIONS: Yes, Mildly, No]
      - Wait for the user's answer before asking the NEXT isolation question
      - After 2-3 confirmatory answers all pointing to the SAME condition, only THEN
        frame your suggestion warmly: e.g. "Based on what you've shared, it sounds
        like you may have a Dairy Allergy. I recommend adding this to your profile
        so you get accurate risk warnings." and include [SUGGEST_CONDITION: MDC_ID]

   d) NEVER suggest a condition already registered in the user's profile: ({user_conditions_str}).
      NEVER suggest more than one condition in a single reply.
      If multiple conditions are still possible after questioning, ask ONE more question
      to narrow it down further before suggesting.

   e) Condition codes for reference: {condition_code_ref}
7. USE ALL CONTEXT — The sections below are your primary source materials. \
Use them to give specific, evidence-backed answers. Do not fabricate or generalise \
when real data is available.{profile_context_block}{product_context_block}

=== WEB SEARCH EVIDENCE ===
{search_context if search_context else "No web results available — rely on your medical training."}
"""

        # ── Decide reply ─────────────────────────────────────────────────────────
        bot_reply = None
        groq_failed = False
        hf_failed = False
        error_reason = None

        if pleasantry_reply:
            bot_reply = pleasantry_reply

        elif out_of_domain_nudge:
            # 3+ consecutive purely off-topic messages → friendly nudge
            bot_reply = out_of_domain_nudge

        else:
            # ── Primary: Groq ────────────────────────────────────────────────────
            groq_api_key = os.environ.get("GROQ_API_KEY")
            if groq_api_key:
                try:
                    groq_messages = [{"role": "system", "content": system_prompt}]
                    for entry in trimmed_history:
                        groq_messages.append({
                            "role": entry.get("role", "user"),
                            "content": entry.get("content", ""),
                        })
                    groq_messages.append({"role": "user", "content": user_message})

                    response = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {groq_api_key}",
                            "Content-Type": "application/json",
                        },
                        json={
                            "model": "llama-3.1-8b-instant",
                            "messages": groq_messages,
                            "temperature": 0.72,
                            "max_tokens": 320,
                        },
                        timeout=15,
                    )
                    if response.ok:
                        bot_reply = response.json()["choices"][0]["message"]["content"].strip()
                    else:
                        groq_failed = True
                except Exception:
                    groq_failed = True
            else:
                groq_failed = True

            # ── Secondary: Hugging Face ──────────────────────────────────────────
            if groq_failed and not bot_reply:
                try:
                    formatted_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n"
                    for entry in trimmed_history:
                        formatted_prompt += f"<|im_start|>{entry.get('role')}\n{entry.get('content')}<|im_end|>\n"
                    formatted_prompt += f"<|im_start|>user\n{user_message}<|im_end|>\n<|im_start|>assistant\n"

                    hf_headers = {}
                    hf_token = os.environ.get("HUGGINGFACE_API_KEY") or os.environ.get("HF_API_KEY")
                    if hf_token:
                        hf_headers["Authorization"] = f"Bearer {hf_token}"

                    hf_response = requests.post(
                        "https://api-inference.huggingface.co/models/Qwen/Qwen2.5-1.5B-Instruct",
                        headers=hf_headers,
                        json={
                            "inputs": formatted_prompt,
                            "parameters": {"max_new_tokens": 280, "temperature": 0.6, "return_full_text": False},
                            "options": {"wait_for_model": True},
                        },
                        timeout=35,
                    )
                    if hf_response.ok:
                        res_data = hf_response.json()
                        raw = (res_data[0].get("generated_text", "") if isinstance(res_data, list)
                               else res_data.get("generated_text", ""))
                        if "<|im_end|>" in raw:
                            raw = raw.split("<|im_end|>")[0]
                        bot_reply = raw.strip() or None
                    else:
                        hf_failed = True
                except Exception:
                    hf_failed = True

        # ── Post-processing guard: strip premature condition suggestions ──────────
        # Transient / generic symptoms that must NEVER alone trigger a suggestion
        TRANSIENT_SYMPTOMS = {
            "fever", "cold", "flu", "cough", "runny nose", "body ache", "headache",
            "fatigue", "tired", "tiredness", "dizziness", "dizzy", "stress",
            "stressed", "insomnia", "mild nausea", "nausea", "chills", "shiver",
            "shivering", "temperature", "sore throat", "weakness", "sneezing",
            "sneeze", "lethargy", "lethargic",
        }
        # Serious/persistent signals that DO justify entering diagnostic questioning
        SERIOUS_SIGNALS = {
            "rash", "hives", "swelling", "anaphyl", "bleed", "chronic",
            "persistent", "recurring", "always", "every time", "whenever i eat",
            "severe", "extreme", "allergic reaction", "vomit", "breathe",
            "chest pain", "palpitation", "unable to", "itching badly",
            "itchy", "burning sensation", "stomach cramp", "diarrhea",
            "bloating", "can't eat", "cannot eat", "intolerance",
        }

        if bot_reply and "[SUGGEST_CONDITION:" in bot_reply:
            # Count how many user turns existed BEFORE the current message
            prior_user_turns = sum(
                1 for m in trimmed_history if m.get("role") == "user"
            )
            # Check whether the AI has been asking diagnostic questions recently
            recent_assistant_msgs = [
                m.get("content", "").lower()
                for m in trimmed_history[-8:]
                if m.get("role") == "assistant"
            ]
            ai_asked_diagnostic_questions = sum(
                1 for r in recent_assistant_msgs
                if "?" in r and any(
                    kw in r for kw in [
                        "ever had", "do you", "have you", "did you", "when you eat",
                        "after eating", "after consuming", "reaction", "options:",
                    ]
                )
            )
            # Determine if current message + history contain ONLY transient terms
            all_user_text = msg_lower + " " + " ".join(
                m.get("content", "").lower()
                for m in trimmed_history
                if m.get("role") == "user"
            )
            only_transient = (
                any(t in all_user_text for t in TRANSIENT_SYMPTOMS)
                and not any(s in all_user_text for s in SERIOUS_SIGNALS)
            )
            # Strip the suggestion if any guard fails:
            #   • Fewer than 3 prior user turns (conversation too young)
            #   • AI has not asked at least 1 diagnostic question yet
            #   • All signals in the conversation are transient/minor only
            if prior_user_turns < 3 or ai_asked_diagnostic_questions < 1 or only_transient:
                bot_reply = re.sub(
                    r"\[SUGGEST_CONDITION:\s*MDC\d+\]", "", bot_reply
                ).strip()

        # ── Last-resort fallbacks (both APIs failed) ─────────────────────────────
        if not bot_reply:
            if is_profile_query and profile_fallback_reply:
                bot_reply = profile_fallback_reply
            elif web_results:
                snippets = " ".join(r["snippet"] for r in web_results[:3])
                bot_reply = f"Based on available sources: {snippets} Let me know if you'd like more detail."
            elif product_info:
                bot_reply = (
                    f"This product ({product_info['product_name']} by {product_info['brand']}) "
                    f"contains {product_info['additives_count']} additives. "
                    f"Given your profile ({user_conditions_str}), consulting a dietitian is recommended. "
                    f"What else would you like to know?"
                )
            else:
                bot_reply = (
                    "I'm here for all your food safety and health queries! "
                    "Could you share more — a product, ingredient, or health concern?"
                )

        # ── Persist to chat history ──────────────────────────────────────────────
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
