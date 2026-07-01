"""
services/ai_service.py — Gemini API proxy.
The AI ONLY returns structured JSON chart commands.
It NEVER generates SQL, modifies queries, or accesses the database.
"""
import json
import re
import google.generativeai as genai
from config import Config

ALLOWED_ACTIONS = {
    "change_chart_type",
    "sort_chart",
    "filter_chart",
    "highlight_segment",
    "toggle_series",
    "explain_chart",
    "reset_chart",
}

SYSTEM_PROMPT = """You are a dashboard controller AI for an AI-Powered DVD Rental Business Intelligence Dashboard.

Your ONLY job is to translate user commands into structured JSON that the frontend will execute on Chart.js visualizations.

RULES — you MUST follow all of them:
1. ALWAYS respond with a single JSON object only. No prose, no markdown, no explanation.
2. NEVER generate SQL, modify database queries, or reference backend logic.
3. NEVER suggest retraining ML models.
4. ONLY use these allowed actions:
   - change_chart_type : change the chart type (bar, line, doughnut, pie, radar, polarArea)
   - sort_chart        : sort data (direction: "asc" | "desc", key: "value" | "label")
   - filter_chart      : show subset (top_n: int, or segments: [list of label strings])
   - highlight_segment : highlight one segment by label name
   - toggle_series     : show or hide a series (series: str, visible: bool)
   - explain_chart     : return a text explanation of the current chart
   - reset_chart       : restore chart to its original state

5. If the user asks for something NOT in the allowed list, respond with:
   {"action": "error", "message": "That action is not supported. I can only change chart types, sort, filter, highlight, toggle series, explain charts, or reset charts."}

6. Target chart IDs on this dashboard:
   - "revenue_chart"       : Genre revenue bar chart
   - "rental_chart"        : Genre rental count bar chart
   - "share_chart"         : Revenue share doughnut
   - "rating_revenue"      : Rating revenue bar
   - "rating_rental"       : Rating rental bar
   - "rating_share"        : Rating rental share doughnut
   - "genre_rating_chart"  : Genre × Rating grouped bar
   - "popularity_gauge"    : Next Big Hit score gauge
   - "feature_chart"       : Feature importance bar
   - "stock_chart"         : Inventory days-to-empty bar
   - "velocity_chart"      : Rental velocity bar
   - "sma_chart"           : SMA forecast line chart

7. If no specific chart is mentioned but context is clear, infer the most relevant target.

RESPONSE FORMAT — always exactly this shape:
{
  "action": "<one of the allowed actions>",
  "target": "<chart_id>",
  "params": { ... action-specific params ... }
}

For explain_chart, params should contain:
{ "text": "Your plain-English explanation of what this chart shows and key insights." }

Examples:
User: "change the revenue chart to a doughnut"
→ {"action":"change_chart_type","target":"revenue_chart","params":{"type":"doughnut"}}

User: "sort rentals from highest to lowest"
→ {"action":"sort_chart","target":"rental_chart","params":{"direction":"desc","key":"value"}}

User: "show only top 5 genres"
→ {"action":"filter_chart","target":"revenue_chart","params":{"top_n":5}}

User: "highlight Action"
→ {"action":"highlight_segment","target":"revenue_chart","params":{"segment":"Action"}}

User: "explain the stock chart"
→ {"action":"explain_chart","target":"stock_chart","params":{"text":"..."}}

User: "reset everything"
→ {"action":"reset_chart","target":"all","params":{}}
"""


def init_gemini():
    if Config.GEMINI_API_KEY:
        genai.configure(api_key=Config.GEMINI_API_KEY)
        print("[OK] Gemini configured")
    else:
        print("[WARN] GEMINI_API_KEY not set — AI popup will return errors")


def process_command(user_message: str, context: dict | None = None) -> dict:
    """
    Send user_message to Gemini, parse the JSON command response.
    context can carry the currently visible page / chart names.
    """
    if not Config.GEMINI_API_KEY:
        return {
            "action": "error",
            "message": "AI is not configured. Add GEMINI_API_KEY to your .env file.",
        }

    try:
        model = genai.GenerativeModel(
            model_name=Config.GEMINI_MODEL,
            system_instruction=SYSTEM_PROMPT,
        )

        prompt = user_message
        if context:
            prompt = f"[Context: current page={context.get('page','unknown')}, " \
                     f"visible charts={context.get('charts',[])}]\n\n{user_message}"

        response = model.generate_content(prompt)
        raw = response.text.strip()

        # Strip markdown code fences if Gemini adds them despite the prompt
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        command = json.loads(raw)

        # Safety: reject unknown actions before sending to frontend
        action = command.get("action", "")
        if action not in ALLOWED_ACTIONS and action != "error":
            return {
                "action": "error",
                "message": f"Unrecognised action '{action}' blocked by safety filter.",
            }

        return command

    except json.JSONDecodeError:
        return {
            "action": "error",
            "message": "AI returned an invalid response. Please rephrase your command.",
        }
    except Exception as e:
        return {
            "action": "error",
            "message": f"AI service error: {str(e)}",
        }
