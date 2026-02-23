import os
import re
from dotenv import load_dotenv

import cloudinary
import cloudinary.uploader

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langchain_core.prompts import PromptTemplate

load_dotenv()

DEFAULT_LOGO_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770974447/mwkdoaojy5wpwzoewyb5.png"
DEFAULT_CHARACTER_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770972383/jyn46erxuogos2dlgmae.jpg"

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

COMPANY_CONTEXT = {
    "company_name": "IV Infotech",
    "contact_info": {
        "website": "www.ivinfotech.com",
        "footer_text": "Call Now: 9924426361"
    },
    "services_list": [
        "Custom Mobile Application Development",
        "CRM & ERP Software",
        "Digital Marketing",
        "UI/UX Design"
    ],
    "address": "S Cube, T-332, Radhanpur road, Opp. Bansari Township, Mehsana, Gujarat 384002 "
}


# ======================
# HELPERS
# ======================
def cloudinary_upload_bytes(file_bytes: bytes, filename: str, folder="kie-inputs") -> str:
    """Upload image bytes to Cloudinary and return a public HTTPS URL."""
    if not (
        os.getenv("CLOUDINARY_CLOUD_NAME")
        and os.getenv("CLOUDINARY_API_KEY")
        and os.getenv("CLOUDINARY_API_SECRET")
    ):
        raise RuntimeError("Cloudinary credentials missing (CLOUDINARY_CLOUD_NAME / KEY / SECRET).")

    result = cloudinary.uploader.upload(
        file_bytes,
        folder=folder,
        public_id=os.path.splitext(filename)[0],
        overwrite=True,
        resource_type="image"
    )
    return result["secure_url"]


def ensure_image_url(image_bytes: bytes | None, default_url: str, filename: str) -> str:
    """
    If image_bytes exists -> upload to cloudinary -> return URL
    else -> return default_url
    """
    if image_bytes:
        return cloudinary_upload_bytes(image_bytes, filename=filename)
    return default_url


# ======================
# IMAGE ANALYSIS (URL-based)
# ======================
def get_brand_colors_with_ai_url(logo_url: str, api_key: str):
    prompt = """
Analyze this logo image strictly for Graphic Design purposes.
Task 1: Identify the **PRIMARY Brand Color** (main color of text/icon).
Task 2: Identify a **SECONDARY/ACCENT Color**.
OUTPUT FORMAT: Return ONLY two HEX codes separated by a comma.
"""

    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=50)

    content = [{"type": "text", "text": prompt}]
    if logo_url:
        content.append({"type": "image_url", "image_url": {"url": logo_url}})
    
    print("Sending logo URL to LLM for color analysis:", logo_url)

    try:
        response = llm.invoke([HumanMessage(content=content)])
        text = (response.content or "").strip()
        hex_colors = [c.strip() for c in text.split(",") if c.strip()]

        if len(hex_colors) < 1:
            return ["#0055FF", "#555555"]
        if len(hex_colors) < 2:
            hex_colors.append("#555555")

        return hex_colors[:2]
    except Exception as e:
        print(f"Error in brand color analysis: {e}")
        return ["#0055FF", "#555555"]


def get_character_description_url(character_url: str, api_key: str):
    prompt = """
Analyze this character image and provide an IDENTITY-LOCK description that helps recreate the SAME person consistently.
Focus ONLY on stable identity traits: face shape, hairstyle, beard/moustache shape, skin tone, eyebrows/eyes, nose, lips, body proportions, clothing basics.
Avoid mentioning photographic terms (studio lighting, bokeh, camera lens, HDR, ultra-realistic, cinematic).
Write 6-10 bullet points. No JSON.
"""

    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=220)

    content = [{"type": "text", "text": prompt}]
    if character_url:
        content.append({"type": "image_url", "image_url": {"url": character_url}})
        
    print("Sending character URL to LLM for description:", character_url)

    try:
        response = llm.invoke([HumanMessage(content=content)])
        return (response.content or "").strip()
    except Exception as e:
        print(f"Error in character description: {e}")
        return "Character description not available."


# -------------------------
# Hiring details helper (single source of truth)
# -------------------------
def _format_hiring_details(position: str, experience: str, post: str, location: str) -> str:
    """
    Normalized hiring details block used across concept + final prompt.
    post = number of openings (or a short openings string).
    """
    position = (position or "").strip()
    experience = (experience or "").strip()
    post = (post or "").strip()
    location = (location or "").strip()

    lines = []
    if position:
        lines.append(f"- Position: {position}")
    if experience:
        lines.append(f"- Experience: {experience}")
    if post:
        lines.append(f"- Openings: {post}")
    if location:
        lines.append(f"- Location: {location}")

    return "\n".join(lines) if lines else "N/A"


# =========================================================
# 1) VISUAL CONCEPT GENERATOR (conflict-free but still strict)
# =========================================================
def generate_visual_concept(
    keyword,
    services,
    api_key,
    character_description,
    banner_mode,
    position: str = "",
    experience: str = "",
    post: str = "",
    location: str = ""
):
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)
    hiring_details_block = _format_hiring_details(position, experience, post, location)

    template = """
You are a Senior Creative Director and World-Class Art Director.

BANNER TYPE:
- {banner_mode} (MARKETING or HIRING)

Your task: invent a visually distinct STORY MOMENT (a single premium metaphor scene) — not a layout template.

-------------------------------------
CORE STYLE (STRICT)
-------------------------------------
• Premium corporate illustration (NOT a photograph).
• Clean white / very light background with breathing space.
• Flat vector + subtle gradients only.
• Minimal, modern, calm, readable.
• Avoid clutter: ONE central metaphor only.
- mataphor or keyword (in image) size 70% to 80% and character size 20% to 30% of the banner, so that the focus is on the concept and the metaphor, not on the character, but still keep the character visible and clear, but not too big, so it doesn't steal the attention from the concept and the metaphor.
-The character must be large enough for their exact facial features to be perfectly recognizable, but small enough that they do not overpower the image. Frame the scene as a medium-wide shot or environmental portrait.
-------------------------------------
INPUT CONTEXT
-------------------------------------
• Keyword (PRIMARY DRIVER): "{keyword}"
• Company Services (SECONDARY CONTEXT): {services}
• Main Character Identity (LOCKED):
{character_description}
• Hiring Details (HIRING only):
{hiring_details_block}

-------------------------------------
IDENTITY + FACE VISIBILITY LOCK (CRITICAL)
-------------------------------------
• (put this line context in prompt)Main and most important thing is, do not main character to big it is just a supporting element main focus should be on the metaphor, keyword and the environment, not on the character. (because all focus is goes to main character and we don't want that, we want the focus to be on the concept and the metaphor, not on the character, so keep the character smaller and more in the background, but still visible and clear, but not too big, so it doesn't steal the attention from the concept and the metaphor)
• Same identity across all banners: same facial structure, beard shape, hairstyle, skin tone, proportions.
• Do NOT reinterpret the face.
• Face must be clearly visible (front or 3/4 front view). No back view. No hidden face.
• Character must match the provided reference identity exactly.
• Rendering note: keep an illustrated look, but with believable facial proportions (illustration-real, not photoreal).
- ## cherecter must look same as given image ##(put this line in prompt)

-------------------------------------
KEYWORD DOMINANCE RULE
-------------------------------------
• The KEYWORD drives the central metaphor, action, and environment transformation.
• Services may appear only as subtle secondary hints (background modules / tiny symbols), never competing with the keyword.


-------------------------------------
ANTI-LITERAL MARKETING BLOCK (CRITICAL)
-------------------------------------
The concept must NOT use any of the following clichés:
• floating marketing icons (SEO badges, social media logos, play buttons, megaphones, charts as stickers)
• emoji-like symbols, sticker collages, colorful icon clouds
• generic "digital marketing icons" or "UI icon landscape"
• stock-poster fog reveal tricks

Digital marketing MUST be expressed through a premium metaphor with structure and mechanism:
• structural / architectural / system transformation
• layered frameworks, grids, modules, scaffolds, or controlled energy forming a system
• a clear cause → effect reaction in the environment driven by the character's action

SIGNATURE ELEMENT (MANDATORY):
Choose exactly ONE signature element and weave it into the scene:
portal ring OR staircase path OR blueprint grid OR modular factory line OR constellation network OR circuit-tree OR control console.
(Use only one. Make it feel natural and premium. Not decorative.)

-------------------------------------
MODE-SPECIFIC ACTION LOGIC
-------------------------------------
If MARKETING:
• Action should feel strategic and deliberate (not dramatic physical exertion).
• The metaphor must feel structural, architectural, or systemic.
• Innovation originates from his subtle, insightful gesture.
• Environment reacts with a clear structural mechanism (assembly, alignment, lift, calibration, transformation).
• HARD BAN: do NOT use floating marketing icons, SEO symbols, social logos, play buttons, megaphones, or sticker-like charts.
• Prefer metaphor over literal dashboards/UI.

If HIRING:
• Action may be structured: review, selection, assembly, evaluation, onboarding.
• Include subtle hiring artifacts (cards, tiles, skill tokens) ONLY if they fit naturally.

-------------------------------------
ANTI-REPETITION / DIFFERENTIATION SYSTEM
-------------------------------------
Prevent similarity by changing at least 3 of these every time:
• BODY MECHANICS (leaning, calibrating, aligning, assembling, drafting, engineering, synchronizing, refining).
• TOOL/OBJECT of interaction.
• ENVIRONMENT RESPONSE (how the world reacts).
• METAPHOR CATEGORY (architectural / energetic / structural / transformational / collaborative).

Do not just block repetition — invent a new physical interaction.

-------------------------------------
SPACE AWARENESS (NO LAYOUT INSTRUCTIONS, JUST SAFE ZONES)
-------------------------------------
• Keep generous negative space so text can remain clear.
• Avoid busy elements near top-right (logo safety zone) and top-left (title safety zone).
(Do NOT describe exact placement. Just keep these areas clean.)

-------------------------------------
MULTI-CHARACTER LOGIC
-------------------------------------
• Default: single main character.
• Add 1–2 supporting characters ONLY if the keyword or banner mode logically requires collaboration/mentorship/team dynamics.
• Main character remains the visual anchor.

-------------------------------------
MANDATORY OUTPUT FORMAT
-------------------------------------
Return EXACTLY:

ACTION_ID: [short unique token]
ACTION: [one clear sentence describing the physical action]
SCENE: [vivid description of environment + metaphor + cause-effect]
LOGICAL: [brief explanation of how the action and scene embody the keyword and banner mode]

Do NOT mention layout placement.
Do NOT mention text overlays.
Do NOT mention camera details.
"""

    prompt = PromptTemplate(
        template=template,
        input_variables=[
            "banner_mode", "keyword", "services",
            "character_description", "hiring_details_block"
        ],
    )

    return llm.invoke(
        prompt.format(
            banner_mode=banner_mode,
            keyword=keyword,
            services=services,
            character_description=character_description,
            hiring_details_block=hiring_details_block
        )
    ).content


# -------------------------
# Concept quality gate
# -------------------------
_BANNED_CONCEPT_PATTERNS = [
    r"\bicon(s)?\b",
    r"\bseo\b",
    r"\bsocial\s*media\b",
    r"\bmegaphone\b",
    r"\bplay\s*button\b",
    r"\byoutube\b|\binstagram\b|\bfacebook\b|\bwhatsapp\b|\blinkedin\b",
    r"\bsticker\b",
    r"\bemoji\b",
    r"\bui\s*icons?\b",
    r"\bicon\s*cloud\b",
    r"\bcolorful\s*icons?\b",
]

def validate_concept(concept_text: str) -> tuple[bool, str]:
    """
    Returns (ok, reason). If not ok, reason explains what failed.
    We fail fast on cliché icon-collage patterns to prevent stock poster outputs.
    """
    t = (concept_text or "").lower()
    if not t.strip():
        return False, "empty concept"

    # must contain mandatory keys (rough check)
    required = ["action_id:", "action:", "scene:", "logical:"]
    if not all(k in t for k in required):
        return False, "missing required ACTION_ID/ACTION/SCENE/LOGICAL format"

    for pat in _BANNED_CONCEPT_PATTERNS:
        if re.search(pat, t, flags=re.IGNORECASE):
            return False, f"contains banned cliché pattern: {pat}"

    return True, "ok"


def get_marketing_copy(keyword, company_name, api_key):
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

    template = """
Create a concise, professional headline for {company} centered on “{keyword}.”
Guidelines:
- Max 5 words
- Short, punchy, catchy
Output:
HEADLINE: [Headline text]
"""
    prompt = PromptTemplate.from_template(template)
    formatted = prompt.format(keyword=keyword, company=company_name)

    try:
        response = llm.invoke([HumanMessage(content=formatted)])
        return (response.content or "").strip()
    except Exception as e:
        print(f"Error in marketing copy generation: {e}")
        return "Marketing copy generation failed."


def get_hiring_copy(keyword, company_name, address, api_key, position="", experience="", location="", post=""):
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

    template = """
You are a senior copywriter creating text for a premium corporate hiring banner.

INPUTS:
- Company: {company}
- Hiring Keyword/Theme: "{keyword}"
- Position/Role: "{position}"
- Experience: "{experience}"
- Openings/Requirements: "{post}"
- Location (user-provided): "{location}"
- Company Address (fallback): {address}

OUTPUT FORMAT (STRICT):
TITLE: [text]
SUBTITLE: [text]
ADDRESS: [text]
"""
    prompt = PromptTemplate.from_template(template)
    formatted = prompt.format(
        keyword=keyword, company=company_name, address=address,
        position=position, experience=experience, location=location, post=post
    )

    try:
        response = llm.invoke([HumanMessage(content=formatted)])
        return (response.content or "").strip()
    except Exception as e:
        print(f"Error in hiring copy generation: {e}")
        return "Hiring copy generation failed."


def get_final_prompt(
    banner_mode, keyword, title, subtitle, address_line,
    primary, secondary, visual_concept, website, phone, api_key,
    character_description,
    position="", experience="", post="", location=""
):
    llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

    if banner_mode not in ["MARKETING", "HIRING"]:
        raise ValueError("Invalid banner_mode. Must be MARKETING or HIRING.")

    # ================================
    # MARKETING TEMPLATE
    # ================================
    if banner_mode == "MARKETING":

        template_text = f"""
You are an expert AI Image Prompt Engineer.

Generate ONE premium corporate square social media banner illustration for MARKETING.
## logo at the top right corner. ##(Must put this line in prompt)

-------------------------------------
BANNER TYPE: MARKETING
-------------------------------------

• Focus on brand authority, innovation, and strategic value.
• Absolutely NO hiring indicators.
• Do NOT include hiring badges.
• Do NOT include “WE’RE HIRING”.
• Do NOT include candidate cards, HR visuals, or recruitment language.

-------------------------------------
VISUAL CONCEPT
-------------------------------------
{visual_concept}
• make sure that focus is on the keyword and the metaphor , so do not make main character too big ,so that it do not take the attention .
- create visual metaphor around the keyword little bit services, showing how it transforms or elevates the business.
- you are best Marketing Conceptualizer , make it simple and minimal.
The character MUST perform the exact ACTION defined above.

-------------------------------------
STYLE
-------------------------------------
• Premium corporate illustration.
• Clean white background.
• Flat vector + subtle gradients.
• Minimal and uncluttered.
• No decorative icons.
• No sticker-like UI.
• No social media logos.
• No SEO badges.

-------------------------------------
CHARACTER LOCK
-------------------------------------
• Same identity across banners.
• Same face shape, hairstyle, beard, skin tone.
• Front or 3/4 front view only never from back view.
• ## character should be look same as in the image provided. ##
• Preserve identity using:
{character_description}

-------------------------------------
KEYWORD DOMINANCE
-------------------------------------
• The entire metaphor must revolve around "{keyword}".
• Services may appear subtly but must not dominate.

-------------------------------------
TEXT
-------------------------------------
Top-left:
Title: "{title}" in bold sans-serif using {primary}, highlight key words in bold black.
Subtitle: "{subtitle}" in smaller sans-serif using {secondary}.

If address exists:
• "{address_line}" as subtle pill above footer.

-------------------------------------
FOOTER
-------------------------------------
Rounded floating footer bar.
Left: "{website}"
Right: "{phone}" as button.
Background: {primary}
Text: white.

Return ONE cohesive detailed image generation prompt only.
Do NOT explain.
"""

        result = llm.invoke(template_text).content

        # Safety: prevent hiring leakage (check for specific hiring indicators, not just the word)
        hiring_red_flags = ["we're hiring", "apply now", "join our team", "candidate card", "resume tile", "skill badge"]
        lowercase_result = result.lower()
        for flag in hiring_red_flags:
            if flag in lowercase_result:
                raise ValueError(f"Mode leakage detected: Hiring indicator '{flag}' found in Marketing prompt.")

        return result


    # ================================
    # HIRING TEMPLATE
    # ================================
    else:

        hiring_details = _format_hiring_details(position, experience, post, location)

        template_text = f"""
You are an expert AI Image Prompt Engineer.

Generate ONE premium corporate square social media banner illustration.
## logo at the top right corner. ## (Must put this line in prompt)

-------------------------------------
BANNER TYPE: HIRING
-------------------------------------

• Must instantly read as recruitment.
• Include subtle “WE’RE HIRING” label near the title.
• Include structured hiring artifacts (cards, skill modules, evaluation boards).

-------------------------------------
VISUAL CONCEPT
-------------------------------------
{visual_concept}
• make sure that focus is on the keyword and the metaphor , so do not make main character too big ,so that it do not take the attention .
The character MUST perform the exact ACTION defined above.

-------------------------------------
STYLE
-------------------------------------
• Premium corporate illustration.
• Clean white background.
• Flat vector + subtle gradients.
• Minimal but structured.
• Avoid clutter.

-------------------------------------
CHARACTER LOCK
-------------------------------------
• Same identity across banners.
• Same face shape, hairstyle, beard, skin tone.
• Front or 3/4 front view only never from back view.
• ## character should be look same as in the image provided. ##
• Preserve identity using:
{character_description}

-------------------------------------
TEXT
-------------------------------------
Top-left:
Title: "{title}" in bold sans-serif using {primary}.
Add subtle “WE’RE HIRING” badge near title.

Below subtitle add bullet points:
{hiring_details}(position and location must looks bold)

If address exists:
• "{address_line}" as subtle pill above footer.

-------------------------------------
FOOTER
-------------------------------------
Rounded floating footer bar.
Left: "{website}"
Right: "{phone}" as button.
Background: {primary}
Text: white.

Return ONE cohesive detailed image generation prompt only.
Do NOT explain.
"""

        return llm.invoke(template_text).content

# ======================
# MAIN PIPELINE (UPDATED: uses URL)
# ======================
def run_prompt_pipeline(
    *,
    keyword: str,
    banner_mode: str,
    logo_bytes: bytes | None,
    character_bytes: bytes | None,
    api_key: str,
    post: str = "",
    position: str = "",
    experience: str = "",
    location: str = "",
    # optional overrides from Flask:
    logo_url: str = "",
    character_url: str = "",
):
    # ✅ always end up with urls (uploaded if bytes exist, else default url)
    final_logo_url = ensure_image_url(
        logo_bytes,
        default_url=(logo_url or DEFAULT_LOGO_URL),
        filename="logo.jpg"
    )
    final_character_url = ensure_image_url(
        character_bytes,
        default_url=(character_url or DEFAULT_CHARACTER_URL),
        filename="character.jpg"
    )

    # 1) Colors from logo URL
    primary_hex, secondary_hex = get_brand_colors_with_ai_url(final_logo_url, api_key)

    # 2) Character description from character URL
    character_description = get_character_description_url(final_character_url, api_key)

    # 3) Concept
    # 3) Concept (with quality gate)
    concept = ""
    last_reason = ""
    for attempt in range(1, 4):  # up to 3 tries
        concept_candidate = generate_visual_concept(
            keyword=keyword,
            services=COMPANY_CONTEXT["services_list"],
            api_key=api_key,
            character_description=character_description,
            banner_mode=banner_mode,
            position=position if banner_mode == "HIRING" else "",
            experience=experience if banner_mode == "HIRING" else "",
            post=post if banner_mode == "HIRING" else "",
            location=location if banner_mode == "HIRING" else ""
        )

        ok, reason = validate_concept(concept_candidate)
        if ok:
            concept = concept_candidate
            break
        last_reason = reason
        # Add a tiny nudge by appending a strict rejection note to the next attempt via keyword/services (no extra prompt args),
        # so we simply retry; the template itself already contains hard bans.

    if not concept:
        # fallback: use the last candidate even if imperfect, but log why it failed
        concept = concept_candidate
        print(f"[WARN] Concept quality gate failed after 3 tries: {last_reason}")

    # 4) Copy
    title = ""
    subtitle = ""
    address_line = ""

    if banner_mode == "HIRING":
        copy_text = get_hiring_copy(
            keyword=keyword,
            company_name=COMPANY_CONTEXT["company_name"],
            address=COMPANY_CONTEXT["address"],
            api_key=api_key,
            position=position,
            experience=experience,
            location=location,
            post=post
        )

        try:
            lines = copy_text.split("\n")
            title = [l for l in lines if "TITLE:" in l][0].replace("TITLE:", "").strip()
            subtitle = [l for l in lines if "SUBTITLE:" in l][0].replace("SUBTITLE:", "").strip()
            address_line = [l for l in lines if "ADDRESS:" in l][0].replace("ADDRESS:", "").strip()
        except Exception:
            title = position.strip() if position.strip() else "We're Hiring"
            subtitle = (experience.strip() + " • Apply Now").strip(" •")
            address_line = location.strip() if location.strip() else "Mehsana, Gujarat"
    else:
        copy_text = get_marketing_copy(keyword, COMPANY_CONTEXT["company_name"], api_key)
        try:
            lines = copy_text.split("\n")
            title = [l for l in lines if "HEADLINE:" in l][0].replace("HEADLINE:", "").strip()
        except Exception:
            title = f"{keyword}"
        subtitle = ""
        address_line = ""

    # 5) Final prompt
    final_prompt = get_final_prompt(
        banner_mode=banner_mode,
        keyword=keyword,
        title=title,
        subtitle=subtitle,
        address_line=address_line,
        primary=primary_hex,
        secondary=secondary_hex,
        visual_concept=concept,
        website=COMPANY_CONTEXT["contact_info"]["website"],
        phone=COMPANY_CONTEXT["contact_info"]["footer_text"],
        character_description=character_description,
        api_key=api_key,
        position=position if banner_mode == "HIRING" else "",
        experience=experience if banner_mode == "HIRING" else "",
        post=post if banner_mode == "HIRING" else "",
        location=location if banner_mode == "HIRING" else ""
    )

    return {
        "primary_hex": primary_hex,
        "secondary_hex": secondary_hex,
        "concept": concept,
        "title": title,
        "subtitle": subtitle,
        "address_line": address_line,
        "final_prompt": final_prompt,
        "logo_url_used": final_logo_url,
        "character_url_used": final_character_url,
        "hiring_inputs": {
            "position": position,
            "experience": experience,
            "location": location,
            "post": post
        } if banner_mode == "HIRING" else {}
    }


# in visual_prompt in last output SIGNATURE_ELEMENT: [choose ONE only: portal ring / staircase path / blueprint grid / modular factory line / constellation network / circuit-tree / control console]
# Avoid common tech-banner gestures such as:
# - open-palm floating display
# - pointing at UI panels
# - decorative energy ribbons
# - holding glowing spheres
# - puzzle-piece metaphors






# import os
# import base64
# import re
# from dotenv import load_dotenv
# import cloudinary
# import cloudinary.uploader
# from langchain_openai import ChatOpenAI
# from langchain_core.messages import HumanMessage
# from langchain_core.prompts import PromptTemplate

# load_dotenv()

# DEFAULT_LOGO_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770974447/mwkdoaojy5wpwzoewyb5.png"
# DEFAULT_CHARACTER_URL = "https://res.cloudinary.com/dgtlwozlu/image/upload/v1770972383/jyn46erxuogos2dlgmae.jpg"

# cloudinary.config(
#     cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
#     api_key=os.getenv("CLOUDINARY_API_KEY"),
#     api_secret=os.getenv("CLOUDINARY_API_SECRET"),
#     secure=True
# )


# COMPANY_CONTEXT = {
#     "company_name": "IV Infotech",
#     "contact_info": {
#         "website": "www.ivinfotech.com",
#         "footer_text": "Call Now: 9924426361"
#     },
#     "services_list": [
#         "Custom Mobile Application Development",
#         "CRM & ERP Software",
#         "Digital Marketing",
#         "UI/UX Design"
#     ],
#     "address": "S Cube, T-332, Radhanpur rd, Opp. Bansari Township, Kunal, Mehsana, Gujarat 384002 "
# }


# # ======================
# # HELPERS
# # ======================
# def cloudinary_upload_bytes(file_bytes: bytes, filename: str, folder="kie-inputs") -> str:
#     """Upload image bytes to Cloudinary and return a public HTTPS URL."""
#     if not (
#         os.getenv("CLOUDINARY_CLOUD_NAME")
#         and os.getenv("CLOUDINARY_API_KEY")
#         and os.getenv("CLOUDINARY_API_SECRET")
#     ):
#         raise RuntimeError("Cloudinary credentials missing.")

#     result = cloudinary.uploader.upload(
#         file_bytes,
#         folder=folder,
#         public_id=os.path.splitext(filename)[0],
#         overwrite=True,
#         resource_type="image"
#     )
#     return result["secure_url"]


# def ensure_image_url(image_bytes: bytes | None, default_url: str, filename: str) -> str:
#     """
#     If image_bytes exists -> upload to cloudinary -> return URL
#     else -> return default_url
#     """
#     if image_bytes:
#         return cloudinary_upload_bytes(image_bytes, filename)
#     return default_url


# # ======================
# # IMAGE ANALYSIS (BYTES-BASED)
# # ======================
# def get_brand_colors_with_ai_bytes(logo_bytes: bytes, api_key: str):
#     if not logo_bytes:
#         return ["#0055FF", "#555555"]

#     encoded_string = base64.b64encode(logo_bytes).decode("utf-8")

#     prompt = """
#     Analyze this logo image strictly for Graphic Design purposes.
#     Task 1: Identify the **PRIMARY Brand Color** (The main color of the text or icon).
#     Task 2: Identify a **SECONDARY/ACCENT Color**.
#     OUTPUT FORMAT: Return ONLY the two HEX codes separated by a comma.
#     """

#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=50)
#     message = HumanMessage(
#         content=[
#             {"type": "text", "text": prompt},
#             {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_string}"}}
#         ]
#     )

#     try:
#         response = llm.invoke([message])
#         content = response.content.strip()
#         hex_colors = [c.strip() for c in content.split(",") if c.strip()]
#         if len(hex_colors) < 1:
#             return ["#0055FF", "#555555"]
#         if len(hex_colors) < 2:
#             hex_colors.append("#555555")
#         return hex_colors[:2]
#     except Exception as e:
#         print(f"Error in llm invoke: {e}")
#         return ["#0055FF", "#555555"]


# def get_character_description_bytes(character_bytes: bytes, api_key: str):
#     if not character_bytes:
#         return "Character description not available."

#     encoded_image = base64.b64encode(character_bytes).decode("utf-8")

#     prompt = """
#     Analyze this character image and provide a detailed description of the character's appearance,
#     personality traits, and possible backstory.
#     ** describe the character's physical features, clothing style, and any distinctive attributes.**
#     OUTPUT FORMAT: Return a JSON object with the following structure:
#     """

#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=200)
#     message = HumanMessage(
#         content=[
#             {"type": "text", "text": prompt},
#             {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{encoded_image}"}}
#         ]
#     )
#     try:
#         response = llm.invoke([message])
#         return response.content.strip()
#     except Exception as e:
#         print(f"Error in character description: {e}")
#         return "Character description not available."


# # ======================
# # IMAGE ANALYSIS (URL-BASED)
# # ======================
# def get_brand_colors_with_ai_url(logo_url: str, api_key: str):
#     """Analyze logo from URL for brand colors"""
#     prompt = """
# Analyze this logo image strictly for Graphic Design purposes.
# Task 1: Identify the **PRIMARY Brand Color** (main color of text/icon).
# Task 2: Identify a **SECONDARY/ACCENT Color**.
# OUTPUT FORMAT: Return ONLY two HEX codes separated by a comma.
# """

#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=50)

#     content = [{"type": "text", "text": prompt}]
#     if logo_url:
#         content.append({"type": "image_url", "image_url": {"url": logo_url}})
    
#     print("Sending logo URL to LLM for color analysis:", logo_url)

#     try:
#         message = HumanMessage(content=content)
#         response = llm.invoke([message])
#         result = response.content.strip()
#         hex_colors = [c.strip() for c in result.split(",") if c.strip()]
#         if len(hex_colors) < 1:
#             return ["#0055FF", "#555555"]
#         if len(hex_colors) < 2:
#             hex_colors.append("#555555")
#         return hex_colors[:2]
#     except Exception as e:
#         print(f"Error analyzing logo colors: {e}")
#         return ["#0055FF", "#555555"]


# def get_character_description_url(character_url: str, api_key: str):
#     """Analyze character from URL with IDENTITY-LOCK description"""
#     prompt = """
# Analyze this character image and provide an IDENTITY-LOCK description that helps recreate the SAME person consistently.
# Focus ONLY on stable identity traits: face shape, hairstyle, beard/moustache shape, skin tone, eyebrows/eyes, nose, lips, body proportions, clothing basics.
# Avoid mentioning photographic terms (studio lighting, bokeh, camera lens, HDR, ultra-realistic, cinematic).
# Write 6-10 bullet points. No JSON.
# """

#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key, max_tokens=220)

#     content = [{"type": "text", "text": prompt}]
#     if character_url:
#         content.append({"type": "image_url", "image_url": {"url": character_url}})
        
#     print("Sending character URL to LLM for description:", character_url)

#     try:
#         message = HumanMessage(content=content)
#         return llm.invoke([message]).content.strip()
#     except Exception as e:
#         print(f"Error analyzing character: {e}")
#         return "Character description not available."


# # -------------------------
# # Hiring details helper
# # -------------------------
# def _format_hiring_details(position: str, experience: str, post: str, location: str) -> str:
#     position = (position or "").strip()
#     experience = (experience or "").strip()
#     post = (post or "").strip()
#     location = (location or "").strip()

#     parts = []
#     if position:
#         parts.append(f"- Position/Role: {position}")
#     if experience:
#         parts.append(f"- Experience: {experience}")
#     if location:
#         parts.append(f"- Location: {location}")
#     if post:
#         parts.append(f"- Post / Requirements: {post}")

#     if not parts:
#         return "No hiring details provided."
#     return "\n".join(parts)


# def generate_visual_concept(
#     keyword,
#     services,
#     api_key,
#     character_description,
#     banner_mode,
#     # NEW optional hiring inputs:
#     position: str = "",
#     experience: str = "",
#     post: str = "",
#     location: str = ""
# ):
#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

#     hiring_details_block = _format_hiring_details(position, experience, post, location)

#     template = """
# You are a Senior Creative Director designing a premium corporate social media visual for a modern technology company.

# BANNER TYPE:
# - {banner_mode} (MARKETING or HIRING)

# Your task is to create a clear visual STORY (a moment of creation), not a generic template.

# CORE STYLE (NON-NEGOTIABLE)
# • Premium corporate illustration: clean, minimal, modern.
# • White / very light background with breathing space.
# • Flat vector look + subtle gradients only (no noisy texture).
# • The main character must look consistent with the provided photo identity.

# INPUT CONTEXT
# • Keyword: "{keyword}"
# • Company Services: {services}
# • Main Character Description:
# {character_description}
# • hiring details (only for HIRING):
# {hiring_details_block}

# IDENTITY CONSISTENCY (CRITICAL)
# • This character is a fixed brand identity.
# • Preserve the SAME facial structure, beard shape, hairstyle, skin tone, and proportions.
# • Do NOT redesign, stylize, or reinterpret the face.
# • Do NOT create a “similar” or “inspired” person.
# • Treat the reference image as the SAME individual, not a variant.
# • Facial features must remain consistent across all generations.

# FACE-VISIBILITY LOCK (NON-NEGOTIABLE)
# - Character must be FRONT or 3/4 FRONT view.
# - Face must be clearly visible (eyes, nose, beard visible).
# - STRICTLY FORBIDDEN: back view, side-back view, over-the-shoulder view, rear angle, face hidden.
# - Do not place the character turned toward a screen with back to viewer.

# CRITICAL PROBLEM TO SOLVE
# • The system keeps repeating the same pose (open palm / pointing / flowing cards).
# • You MUST create a concept that cannot be confused with previous ones.

# ------------------------------------------
# ACTION GRAMMAR DIFFERENCE (VERY IMPORTANT)
# -------------------------------------------
# If MARKETING:
# • Actions must feel INDIRECT and strategic.
# • Examples:
#   - initiating a transformation
#   - unlocking potential
#   - stabilizing chaos
#   - aligning forces
# • Hands should not look like dragging UI or placing cards.

# If HIRING:
# • Actions can be DIRECT and instructional.
# • Examples:
#   - assembling
#   - selecting
#   - organizing
#   - reviewing


# ANTI-REPETITION RULES (NON-NEGOTIABLE)
# • DO NOT use these as the main action:
#   - open palm presenting floating icons
#   - pointing at UI panels
#   - rainbow streams / ribbons
#   - planting a seed
#   - placing a puzzle piece
#   - holding a glowing orb
# • The action must feel physically different: different posture, hand position, interaction, and props.

# BANNER-SPECIFIC STORY LOGIC
# If MARKETING:
# • Show brand value, innovation, outcomes.
# • Use ONE bold symbolic metaphor (not just screens).
# • Services represented as subtle modules/icons (NO text labels).

# If HIRING:
# • Must look instantly like recruitment/team-building.
# • Include hiring artifacts: candidate cards, resume tiles, skill badges (NO real names).
# • IMPORTANT: Similar hiring roles must NOT reuse similar metaphors.
#   - Web Development hiring must not look like App Development hiring.

# ROLE-SPECIFIC GUIDANCE (HIRING ONLY)
# If keyword implies Web Development:
# • Prefer: code scaffolding, framework grid, component architecture, deployment pipeline, responsive grid.
# If keyword implies App Development:
# • Prefer: device frame, app components, mobile UI blocks, build/test pipeline, app store release path.
# If keyword implies Digital Marketing:
# • Prefer: campaign timeline board, funnel stages, analytics dashboard blocks, ad creative tiles.
# If keyword implies UI/UX:
# • Prefer: wireframe sheets, design system tokens, layout grid, prototyping flow.

# MANDATORY OUTPUT (STRICT)
# Return exactly this format:

# ACTION_ID: [one short unique token like: BLUEPRINT_FORGE / PIPELINE_CONSOLE / QA_STAMP / MODULE_ASSEMBLY / FRAMEWORK_GRID]
# ACTION: [one short sentence describing the unique physical action]
# SCENE: [vivid description of the environment + metaphor + how the action causes it]
# SIGNATURE_ELEMENT: [choose exactly ONE from: portal ring / staircase path / blueprint grid / modular factory line / constellation network / circuit-tree / control console]

# Do NOT mention layout positions like left/right.
# Do NOT mention text overlays or logos.
# Do NOT mention camera settings.
# """

#     prompt = PromptTemplate.from_template(template)
#     formatted_prompt = prompt.format(
#         keyword=keyword,
#         services=services,
#         character_description=character_description,
#         banner_mode=banner_mode,
#         hiring_details_block=hiring_details_block
#     )

#     message = HumanMessage(content=formatted_prompt)
#     try:
#         response = llm.invoke([message])
#         return response.content.strip()
#     except Exception as e:
#         print(f"Error in visual concept generation: {e}")
#         return "Visual concept generation failed."


# def get_marketing_copy(keyword, company_name, api_key):
#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

#     template = """
#     Create a concise, professional headline for {company} centered on “{keyword}.”

#     ** do not necessarily mention the company name in the headline. use when appropriate **
#     --- STRICT IDENTITY RULES ---
#     1. NEVER add suffixes like "Solutions", "Pvt Ltd", "Inc", "System", or "LLC".
#     2. If you include the company name, use it exactly as provided.

#     Guidelines:
#     - The headline must be short, punchy and catchy (max 5 words).
#     - Make it aligned with the keyword.
#     - Refined, elegant tone.
#     - Avoid clichés and buzzwords.

#     Output format:
#     HEADLINE: [Headline text]
#     """

#     prompt = PromptTemplate.from_template(template)
#     formatted_prompt = prompt.format(keyword=keyword, company=company_name)
#     message = HumanMessage(content=formatted_prompt)

#     try:
#         response = llm.invoke([message])
#         return response.content.strip()
#     except Exception as e:
#         print(f"Error in marketing copy generation: {e}")
#         return "Marketing copy generation failed."


# def get_hiring_copy(keyword, company_name, address, api_key, position: str = "", experience: str = "", location: str = "", post: str = ""):
#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

#     template = """
# You are a senior copywriter creating text for a premium corporate hiring banner.

# INPUTS:
# - Company: {company}
# - Hiring Keyword/Theme: "{keyword}"
# - Position/Role: "{position}"
# - Experience: "{experience}"
# - Openings: "{post}"
# - Location (user-provided): "{location}"
# - Company Address (fallback): {address}

# STRICT IDENTITY RULES:
# 1) Do NOT always mention the company name in the title; use only when it improves clarity.
# 2) If you include the company name, use it exactly as provided.
# 3) NEVER add suffixes like "Solutions", "Pvt Ltd", "Inc", "System", or "LLC".

# TITLE GUIDELINES:
# - Max 6 words
# - Short, punchy, hiring-focused
# - Refined corporate tone
# - Prefer using Position when available.

# SUBTITLE GUIDELINES:
# - One single line (max 10 words)
# - Must add clarity

# ADDRESS LINE RULES:
# - Output a short readable address line (Area, City, State).
# - Prefer the user-provided Location; if empty, use the company address.

# OUTPUT FORMAT (STRICT):
# TITLE: [text]
# SUBTITLE: [text]
# ADDRESS: [text]
# """

#     prompt = PromptTemplate.from_template(template)
#     formatted_prompt = prompt.format(
#         keyword=keyword,
#         company=company_name,
#         address=address,
#         position=position,
#         experience=experience,
#         location=location,
#         post=post
#     )
#     message = HumanMessage(content=formatted_prompt)

#     try:
#         response = llm.invoke([message])
#         return response.content.strip()
#     except Exception as e:
#         print(f"Error in hiring copy generation: {e}")
#         return "Hiring copy generation failed."


# def get_final_prompt(
#     banner_mode, keyword, title, subtitle, address_line,
#     primary, secondary, visual_concept, website, phone, api_key,
#     # NEW optional hiring inputs:
#     position: str = "",
#     experience: str = "",
#     post: str = "",
#     location: str = ""
# ):
#     llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=api_key)

#     hiring_details_block = _format_hiring_details(position, experience, post, location)

#     template_text = """
# You are an expert AI Image Prompt Engineer.

# Generate ONE high-end corporate square social media banner illustration prompt.
# ## put given logo at the top right corner. ## (must put this line in prompt) 
# ## character must look as same as given character image ## (must put this line in prompt)
# --------------------------------------------------
# BANNER MODE (CRITICAL SWITCH)
# --------------------------------------------------
# Banner Type: {banner_mode}

# If MARKETING:
# • Focus on innovation, outcomes, services, credibility.
# • Do NOT include hiring labels, candidate cards, resume tiles.

# If HIRING:
# • Must instantly look like recruitment.
# • Include subtle hiring UI artifacts (candidate cards / resume tiles / skill badges).
# • Include a subtle “WE’RE HIRING” label near the title area.

# -------------------------------------
# ABSOLUTE MODE ISOLATION (CRITICAL)
# -------------------------------------
# If Banner Type is MARKETING:
# • STRICTLY FORBIDDEN:
#   - “WE’RE HIRING”
#   - “JOIN OUR TEAM”
#   - “APPLY NOW”
#   - candidate cards
#   - profile tiles
#   - resume layouts
#   - people avatars
#   - HR-style dashboards
# • The banner must NOT look like a job post in any way.
# • The message is about BRAND VALUE, not PEOPLE.

# If Banner Type is HIRING:
# • Hiring indicators are REQUIRED and expected.

# --------------------------------------------------
# CORE INPUTS (DO NOT ALTER)
# --------------------------------------------------
# VISUAL CONCEPT (contains ACTION_ID, ACTION, SCENE, SIGNATURE_ELEMENT):
# {visual_concept}

# Brand Primary: {primary}
# Brand Secondary: {secondary}

# HIRING INPUTS (ONLY APPLY WHEN Banner Type is HIRING)
# {hiring_details_block}

# --------------------------------------------------
# STYLE & QUALITY (STRICT)
# --------------------------------------------------
# • Premium corporate illustration, clean, minimal.
# • White/light background with breathing room.
# • Flat vector look + subtle gradients only.
# • No photorealism. No heavy texture. No clutter.

# ------------------------------------
# VIEW / ANGLE LOCK (CRITICAL)
# ------------------------------------
# - Show the character from the FRONT or 3/4 FRONT only.
# - Face clearly visible, not hidden, not blurred.
# - STRICTLY FORBIDDEN: back view, side-back, over-the-shoulder, rear angle, facing away.
# - If interaction requires a screen/object, place the object in front of him so we still see his face.


# --------------------------------------------------
# TEXT HIERARCHY (MOST IMPORTANT)
# --------------------------------------------------
# • Title and subtitle must remain the #1 attention element.
# • Visual effects must NEVER overpower the heading.
# • Keep the scene calm and readable.
# ---------------------------------
# HIRING COLOR CONTROL (CRITICAL)
# ---------------------------------
# If Banner Type is HIRING:
# • Use brand colors {primary} and {secondary} as the main palette.
# • Avoid rainbow gradients and high-contrast neon effects.
# • Keep accent colors minimal and muted.

# --------------------------------------------------
# ANTI-REPETITION LOCK (NON-NEGOTIABLE)
# --------------------------------------------------
# • Do NOT use generic poses: open-palm presentation, pointing at UI panels, wide “marketing” gesture.
# • The character MUST perform the EXACT action defined in the Visual Concept.
# • The banner MUST include the SIGNATURE_ELEMENT from the Visual Concept.
# • The scene must look clearly different from other banners (different prop + different mechanism + different metaphor).

# --------------------------------------------------
# MAIN CHARACTER (IDENTITY LOCK)
# --------------------------------------------------

# • Same identity: same face shape, hairstyle, skin tone, and proportions .
# • Natural skin tones only.
# • Full character visible (no crop head/hands/feet).
# ## character should be look same as in the image provided.(put this line in prompt)
# ### MAIN CHARACTER IS JUST A REPRESENTATION OF THE COMPANY SO {keyword} METAPHOR MUST BE THE FOCUS
# ### SHOW THE CHARACTER INTERACTING WITH THE KEYWORD METAPHOR IN A WAY THAT (main character is not a big deal, the main point is to show main parpase of banner )
# • The main character described in the visual concept MUST appear.
# • This character is a fixed brand identity.
# • Preserve the SAME facial structure, hairstyle,
# skin tone, and proportions.
# • Do NOT redesign, stylize, or reinterpret the face.
# • Treat the reference image as the SAME individual, not a similar person.

# --------------------------------------------------
# ENVIRONMENT RULES
# --------------------------------------------------
# If MARKETING:
# • Represent services as subtle icons/modules (NO text labels).
# • Use one strong symbolic metaphor derived from the concept.

# If HIRING:
# • Show hiring artifacts (candidate cards, resume tiles, skill badges) in a structured, calm way.
# • Must not look like a marketing ad.


# -------------------------------------------
# MARKETING INNOVATION REQUIREMENT (CRITICAL)
# -------------------------------------------
# If MARKETING:
# • The environment must feel more abstract and conceptual than hiring.
# • Prefer metaphors over interfaces.
# • Use:
#   - energy fields
#   - structural transformations
#   - invisible forces
#   - cause-and-effect visuals
# • UI elements must feel symbolic, not functional.
# • The result should feel like a brand film frame, not a software demo.

# --------------------------------------------------
# CANVAS (NON-NEGOTIABLE)
# --------------------------------------------------
# • Square 1:1 composition.
# • Clean white margins.
# • Top-right must remain uncluttered for logo placement.

# --------------------------------------------------
# TEXT PLACEMENT (STRICT)
# --------------------------------------------------
# Top-left:
# ### ALL TEXT ELEMENTS MUST BE CLEARLY READABLE AGAINST THE BACKGROUND, TEXT IS MORE IMPORTANT THEN MAIN CHARACTER ###
# • Top-left:
# – Title "{title}" in very bold sans-serif using {primary} and use bold black colors to highlight important words in title.
# – If "{subtitle}" is not empty, place subtitle directly below
#     the title in smaller sans-serif using {secondary} (no fancy effects).
# • If Banner Type is HIRING:
#     – Include a subtle professional hiring badge near the title area.
#     - (do not put this line is the banner is marketing) if Banner Type is HIRING then put bullet points of position(put a position details from {hiring_details_block}), experience(put a experience details from {hiring_details_block}), post(put a post details from {hiring_details_block}) in small font below subtitle (in steck formate, and make sure this data shown is points) using fitted color.{hiring_details_block}
# If address exists:
# • "{address_line}" in a subtle pill bottom-left ABOVE footer.

# --------------------------------------------------
# FOOTER BAR (STRICT)
# --------------------------------------------------
# Bottom floating rounded footer bar:
# • Left: "{website}"
# • Right: "{phone}" as a button
# Footer background: {primary}
# Footer text: white

# --------------------------------------------------
# FINAL OUTPUT RULES
# --------------------------------------------------
# Output ONE cohesive image prompt only.
# Do NOT explain reasoning.
# Do NOT mention prompt structure or labels.

# ## (MUST MUST do this) review the prompt before returning and make sure it includes all the points mentioned above somehow, if not then regenerate the prompt until it does.

# """

#     prompt = PromptTemplate(
#         input_variables=[
#             "banner_mode", "keyword", "title", "subtitle", "address_line",
#             "primary", "secondary", "visual_concept", "website", "phone",
#             "hiring_details_block"
#         ],
#         template=template_text
#     )

#     formatted_prompt = prompt.format(
#         banner_mode=banner_mode,
#         keyword=keyword,
#         title=title,
#         subtitle=subtitle,
#         address_line=address_line,
#         primary=primary,
#         secondary=secondary,
#         visual_concept=visual_concept,
#         website=website,
#         phone=phone,
#         hiring_details_block=hiring_details_block
#     )

#     message = HumanMessage(content=formatted_prompt)
#     try:
#         response = llm.invoke([message])
#         return response.content.strip()
#     except Exception as e:
#         print(f"Error in final prompt generation: {e}")
#         return "Final prompt generation failed."


# def run_prompt_pipeline(
#     *,
#     keyword: str,
#     banner_mode: str,
#     logo_bytes: bytes,
#     character_bytes: bytes,
#     api_key: str,
#     # NEW hiring-only inputs (frontend will pass these when HIRING selected)
#     post: str = "",
#     position: str = "",
#     experience: str = "",
#     location: str = ""
# ):
#     try:
#         # 1) Colors
#         ai_colors = get_brand_colors_with_ai_bytes(logo_bytes, api_key)
#         primary_hex = ai_colors[0]
#         secondary_hex = ai_colors[1]

#         # 2) Character description
#         character_description = get_character_description_bytes(character_bytes, api_key)

#         # 3) Concept (inject hiring details only for hiring)
#         concept = generate_visual_concept(
#             keyword,
#             COMPANY_CONTEXT["services_list"],
#             api_key,
#             character_description,
#             banner_mode,
#             position=position if banner_mode == "HIRING" else "",
#             experience=experience if banner_mode == "HIRING" else "",
#             post=post if banner_mode == "HIRING" else "",
#             location=location if banner_mode == "HIRING" else ""
#         )

#         # 4) Copy
#         title = ""
#         subtitle = ""
#         address_line = ""

#         if banner_mode == "HIRING":
#             copy_text = get_hiring_copy(
#                 keyword=keyword,
#                 company_name=COMPANY_CONTEXT["company_name"],
#                 address=COMPANY_CONTEXT["address"],
#                 api_key=api_key,
#                 position=position,
#                 experience=experience,
#                 location=location,
#                 post=post
#             )

#             try:
#                 lines = copy_text.split("\n")
#                 title = [l for l in lines if "TITLE:" in l][0].replace("TITLE:", "").strip()
#                 subtitle = [l for l in lines if "SUBTITLE:" in l][0].replace("SUBTITLE:", "").strip()
#                 address_line = [l for l in lines if "ADDRESS:" in l][0].replace("ADDRESS:", "").strip()
#             except Exception:
#                 # fallback uses user-provided location if present
#                 title = position.strip() if position.strip() else "We're Hiring"
#                 subtitle_parts = []
#                 if experience.strip():
#                     subtitle_parts.append(experience.strip())
#                 subtitle_parts.append("Apply Now")
#                 subtitle = " • ".join(subtitle_parts) if subtitle_parts else "Apply Now"
#                 address_line = location.strip() if location.strip() else "Mehsana, Gujarat"
#         else:
#             copy_text = get_marketing_copy(keyword, COMPANY_CONTEXT["company_name"], api_key)
#             try:
#                 lines = copy_text.split("\n")
#                 title = [l for l in lines if "HEADLINE:" in l][0].replace("HEADLINE:", "").strip()
#             except Exception:
#                 title = f"{keyword}"
#             subtitle = ""
#             address_line = ""

#         # 5) Final prompt (inject hiring details only for hiring)
#         final_prompt = get_final_prompt(
#             banner_mode=banner_mode,
#             keyword=keyword,
#             title=title,
#             subtitle=subtitle,
#             address_line=address_line,
#             primary=primary_hex,
#             secondary=secondary_hex,
#             visual_concept=concept,
#             website=COMPANY_CONTEXT["contact_info"]["website"],
#             phone=COMPANY_CONTEXT["contact_info"]["footer_text"],
#             api_key=api_key,
#             position=position if banner_mode == "HIRING" else "",
#             experience=experience if banner_mode == "HIRING" else "",
#             post=post if banner_mode == "HIRING" else "",
#             location=location if banner_mode == "HIRING" else ""
#         )

#         return {
#             "primary_hex": primary_hex,
#             "secondary_hex": secondary_hex,
#             "concept": concept,
#             "title": title,
#             "subtitle": subtitle,
#             "address_line": address_line,
#             "final_prompt": final_prompt,
#             # Optional: return hiring inputs back (useful for debugging/logging)
#             "hiring_inputs": {
#                 "position": position,
#                 "experience": experience,
#                 "location": location,
#                 "post": post
#             } if banner_mode == "HIRING" else {}
#         }
#     except Exception as e:
#         print(f"Error in run_prompt_pipeline: {e}")
#         import traceback
#         traceback.print_exc()
#         raise

