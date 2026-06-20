from django.urls import path
from apps.analysis.views import ScanHistoryView, ChatbotView, ChatbotConfirmConditionView

urlpatterns = [
    path("scan-history/", ScanHistoryView.as_view(), name="scan_history"),
    path("chatbot/chat/", ChatbotView.as_view(), name="chatbot_chat"),
    path("chatbot/confirm-condition/", ChatbotConfirmConditionView.as_view(), name="chatbot_confirm_condition"),
]