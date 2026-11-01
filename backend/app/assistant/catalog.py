"""What the assistant can be asked, as training data for its local intent router.

Each intent has a description (shown to the optional tie-break LLM) and phrasings: direct, indirect, twisted, Hinglish
and misspelt, because demo questions arrive in all of those forms. `subject` intents are questions about the thing the
user just analysed ("why?", "which part?") and are resolved against the conversation, not answered in general.

The held-out set in eval_set.py is written separately and never trains the router.
"""
from __future__ import annotations

SUBJECT = "subject"

INTENTS: dict[str, dict] = {
    # ---- questions about the current result ------------------------------------------------------------------------
    "why": {"kind": SUBJECT, "desc": "Why the current result got its verdict; what made it fake, real or risky.", "examples": [
        "phir bhi fake kaise", "asli lag raha hai phir bhi AI kyun", "kaise pata chala fake hai", "sounds exactly like him, so how is it fake", "kis wajah se fake bola",
        "what's off about it", "it sounds normal to me, what is wrong", "explain why it's flagged", "basis of the decision", "what proves it is generated",
        "why", "why?", "why is it fake", "why did you say that", "what made you think it's AI",
        "on what basis did you decide this", "how did you conclude that", "explain the verdict",
        "why is this high risk", "why is it marked critical", "why not low", "so what gave it away",
        "what's suspicious about it", "why do you think so", "reason?", "what's the reasoning behind this",
        "ye fake kyu hai", "kyun bola ki AI hai", "isko high risk kyu diya", "why u think its fake",
        "what tipped you off", "justify that", "convince me it's a deepfake", "why should I believe you",
        "why is this considered dangerous", "why didn't you flag it", "why is it safe then", "why low",
        "what evidence do you have", "back that up", "how come it's synthetic",
    ]},
    "where": {"kind": SUBJECT, "desc": "Which part, second, word or region of the current item is suspicious.", "examples": [
        "which lines are suspicious", "which sentences look dodgy", "point out the bad lines",
        "is only part of it synthetic", "beginning middle or end", "which bits should I look at", "mark it on the audio", "is the entire recording generated", "which phrase is the problem", "on the graph where is it red",
        "which part is fake", "where exactly", "show me where", "at what second does it sound fake",
        "which portion of the audio is synthetic", "point to the suspicious bit", "which words were flagged",
        "highlight the red flags in the message", "which segment", "where in the clip", "timestamp?",
        "is the whole thing fake or just a part", "kaunsa hissa fake hai", "kis second pe", "show the timeline",
        "which sentence is the scam part", "where is the manipulation", "which area of the image",
        "zoom into the problem", "mark the bad parts", "where does it go wrong",
    ]},
    "confidence": {"kind": SUBJECT, "desc": "How sure the system is about the current result; could it be wrong.", "examples": [
        "any chance it's actually genuine", "galti ho sakti hai", "can the system make a mistake on this one", "is the score trustworthy", "maybe it's just a poor connection", "how much do you trust your own call", "risk of a wrong verdict here",
        "how sure are you", "how confident", "are you certain", "could you be wrong", "is this a false positive",
        "what's the probability", "how accurate is this result", "can I trust this verdict", "100% sure?",
        "kitna sure ho", "pakka fake hai?", "what if you're mistaken", "margin of error", "how reliable is that score",
        "is there doubt", "what are the odds it's real", "chance it's a real person", "would you bet on it",
        "is it definitely fake", "you sure about that?", "confidence level", "could a real voice score like this",
    ]},
    "models": {"kind": SUBJECT, "desc": "Which detector models looked at the current item and how each one voted.", "examples": [
        "which detectors fired", "which of the models flagged it", "who among the models said fake", "opinion of every detector", "which engine caught it", "were the detectors in agreement", "did any model disagree",
        "which models checked this", "who voted", "show me the jury", "what did each model say",
        "did all models agree", "which detector flagged it", "was it unanimous", "split decision?",
        "model wise scores", "break it down per model", "which AI checked the voice", "kis model ne pakda",
        "what does DF arena say about this one", "did NII agree", "how many detectors said fake",
        "per-detector breakdown", "what were the individual scores",
    ]},
    "transcript": {"kind": SUBJECT, "desc": "What was said in the current audio; the transcript and language.", "examples": [
        "write out the voice note", "what's being said", "spoken words", "what is he telling me",
        "what did the caller say", "transcript", "show me the text", "what was said", "what language is it",
        "read it out", "what are they asking", "kya bola usne", "what's in the audio", "words spoken",
        "give me the transcription", "what does the voice note say", "write down what he said",
        "was it hindi", "speech to text", "what is the request in the call",
    ]},
    "tactics": {"kind": SUBJECT, "desc": "The pressure and social-engineering tactics found in the current item.", "examples": [
        "are they rushing me", "emotional manipulation", "what buttons are they pushing", "how are they tricking me",
        "what tactics did they use", "red flags", "what tricks are in it", "manipulation techniques",
        "which psychological tricks", "how are they pressuring me", "what pressure tactics", "list the warning signs",
        "kaunse tricks use kiye", "is there urgency", "are they using fear", "social engineering signs",
        "how is the scammer manipulating", "what makes the message scammy", "what are the scam indicators",
        "is secrecy involved", "persuasion techniques used",
    ]},
    "what_now": {"kind": SUBJECT, "desc": "What the user should do now about the current item; next steps and response plan.", "examples": [
        "should I do what they ask", "do I comply or not", "should I buy the gift cards", "should I share the code", "is it safe to reply",
        "should I go ahead with the payment", "they are waiting for me, what do I do", "do I proceed or not", "how should I deal with this", "kaise deal karu", "what's my move", "should I transfer or wait", "should I hang up",
        "what should I do", "what now", "next steps", "help me", "what do I do now", "how do I respond",
        "should I pay", "should I call back", "ab kya karu", "what action should I take", "how to handle this",
        "give me the plan", "what's the cure", "what should my team do", "how do I protect myself here",
        "what do I tell them", "what should I say to the caller", "should I ignore it", "can I reply",
        "is it ok to send the money", "what's the safe thing to do", "action plan", "kya karna chahiye",
    ]},
    "what_if": {"kind": SUBJECT, "desc": "Counterfactual: how the verdict would change if the voice were human, nothing were asked, etc.", "examples": [
        "would a real recording with the same words be fine", "if it was really him would it be safe", "same message from the real person, still risky", "is a genuine voice with this request ok",
        "what would make it safe", "under what conditions would it be fine", "what would change the verdict to low", "if the caller was genuine how would the score look", "turn it green", "how could this have been low risk",
        "what if it was a real person", "what if the voice was human", "what if they didn't ask for money",
        "would it still be high if it was genuine", "suppose the voice is real", "and if no payment was requested",
        "what changes if it's my actual boss", "agar asli awaaz hoti to", "hypothetically if it were not AI",
        "what would make it low risk", "how would the verdict change", "what if it came from a known number",
        "if the request was harmless would you still flag it", "counterfactual", "what would flip the decision",
    ]},
    "score_math": {"kind": SUBJECT, "desc": "How the current risk score was computed: lenses, contributions and the formula.", "examples": [
        "how much did the words count", "which evidence mattered most", "voice vs words contribution", "how did you reach that percentage",
        "how was the score calculated", "break down the risk score", "where does 99 come from", "show the math",
        "what contributed most", "which witness contributed", "score breakdown", "how did you get this number",
        "explain the 0.97", "risk contributions", "what weighs the most here", "number kaise aaya",
        "decompose the risk", "which factor pushed it up", "how much did the voice count",
    ]},
    "report": {"kind": SUBJECT, "desc": "How to report the current incident: 1930, cybercrime portal, bank, CERT-In, evidence.", "examples": [
        "helpline number", "which number do I call to report", "who do I complain to", "police complaint draft", "where do I register a cyber complaint", "report fraud number india",
        "how do I report this", "where to complain", "file a complaint", "report to police", "cyber cell",
        "1930", "how to report to cybercrime.gov.in", "can you draft the complaint", "evidence for complaint",
        "report kaise karu", "who do I inform", "tell the bank", "cert-in reporting", "report this number",
        "how do I block this number", "chakshu", "what evidence should I keep",
    ]},
    "summary": {"kind": SUBJECT, "desc": "A short plain summary of the current result, for a non-expert.", "examples": [
        "yes or no", "fake or real just tell me", "one word answer", "is my relative really calling", "keep it simple", "plain answer please", "haan ya na",
        "summarise", "summary", "tldr", "in short", "explain like I'm five", "in simple words", "bottom line",
        "give me the gist", "one line answer", "short version please", "seedha bolo", "so is it fake or not",
        "final answer", "verdict?", "result?", "what's the conclusion", "explain it to my grandmother",
        "simple explanation", "is it a scam or not", "real or fake?",
    ]},
    "verify_callback": {"kind": SUBJECT, "desc": "How to verify the real person: callback, code word, challenge questions.", "examples": [
        "the vendor changed bank details, how do I confirm", "how do I confirm the new account is real", "how to check the bank change is genuine", "confirm with the vendor before paying",
        "before paying how can I be sure", "how to double check the request is real", "how do I confirm with the cfo", "what proof should I ask for", "how can I authenticate the person", "make sure the sender is genuine",
        "how do I verify it's really him", "how can I check it's my boss", "challenge questions", "code word",
        "how to confirm identity", "safe word", "what should I ask to confirm", "verify the caller",
        "how do I know it's really my son", "call back on which number", "test if the caller is real",
        "asli hai ya nahi kaise check karu", "questions only the real person knows", "out of band verification",
    ]},

    # ---- actions -------------------------------------------------------------------------------------------------
    "analyse_text": {"desc": "The user pasted a message, email or SMS and wants it checked for a scam.", "examples": [
        "legit or not: you have won a car", "genuine? your sim will be blocked", "is this mail real", "check this whatsapp forward",
        "is this a scam: your account will be blocked today, share OTP", "check this message",
        "analyse this sms", "is this email legit", "can you check this text for me",
        "someone sent me this: send 50000 urgently dont tell anyone", "scan this message", "is this real?",
        "got this on whatsapp, is it fraud", "verify this message please", "check: Dear customer your KYC expired",
        "ye message sahi hai kya", "is this phishing", "analyse: you won a lottery pay fee to claim",
        "my boss texted me to buy gift cards is that normal", "test this text",
    ]},
    "analyse_sample": {"desc": "Run a built-in sample (a fake or real voice, image or video) to see detection live.", "examples": [
        "show me a demo", "analyse a sample", "test a fake voice", "show me how you catch a voice clone",
        "try a sample call", "demo the voice check", "run an example", "show me a real voice for comparison",
        "test an AI image", "give me an example deepfake", "show detection on a sample", "sample chalao",
        "let me see it work", "demonstrate on a cloned voice", "show me a fake photo check", "try it on something",
        "analyse a scam call recording", "play a sample",
    ]},
    "run_scenario": {"desc": "Run one of the Scenario Lab cases (A to H) as a full investigation.", "examples": [
        "run scenario A", "run the CFO scenario", "start the digital arrest scenario", "run a full investigation demo",
        "launch scenario B", "simulate the deepfake meeting", "run the papa emergency case", "scenario lab",
        "run case C", "open a full case on the vendor email", "investigate the IT helpdesk OTP scenario",
        "do a complete investigation", "run all witnesses on a scenario", "scenario E chalao",
    ]},
    "open_case": {"desc": "Show a specific case or the latest / highest-risk case.", "examples": [
        "show case MRG-0537", "open the latest case", "what was the last investigation", "most recent high risk case",
        "show me MRG-0412", "explain case 0530", "the last case", "latest critical incident", "pull up the newest case",
        "what happened in the last investigation", "recent case details", "show me the worst case",
        "open the case I just ran",
    ]},
    "stats": {"desc": "Numbers across all cases: how many, how many high risk, money protected, top tactics.", "examples": [
        "how many cases so far", "total investigations", "count of incidents", "which tactic is most frequent", "most common scam pattern seen", "how many high risk this month", "numbers on the dashboard",
        "how many cases", "dashboard summary", "stats", "how many high risk cases", "what's the threat picture",
        "how much money was protected", "most common tactic", "overview of incidents", "kitne case aaye",
        "give me the numbers", "how many open incidents", "who is impersonated the most", "which channel is most attacked",
        "threat summary for today", "how busy is the system",
    ]},
    "navigate": {"desc": "Open a screen of the app.", "examples": [
        "take me to the voice check", "open the red team lab", "go to the command centre", "open trustbook",
        "show the live call shield page", "where is the liveness check", "navigate to cases", "open settings",
        "go to models page", "open the scenario lab", "take me to drills", "open casebook", "go to the tribunal",
        "open the investigation page", "voice check page kholo", "where can I upload a file",
    ]},
    "redteam_results": {"desc": "Results of the red-team campaigns: catch rate per laundering channel.", "examples": [
        "how did your attacks do", "how did the red team go", "results of attacking yourself", "how many of your fakes were caught",
        "which laundering channel is worst for you", "which transformation fools the detector", "did our attacks evade detection", "how many synthetic samples slipped past", "robustness results by channel", "where did the detector miss in red team",
        "red team results", "how did the attack lab do", "catch rate", "which laundering beats you",
        "latest campaign results", "how many fakes got through", "red team heatmap", "what evades you",
        "did any attack bypass the detector", "campaign stats", "how robust against whatsapp compression",
        "results of the adversarial test",
    ]},

    # ---- knowledge about MIRAGE ------------------------------------------------------------------------------------
    "about": {"desc": "What MIRAGE is, the problem it solves (PS-02) and who it is for.", "examples": [
        "what is this thing", "what's this app", "explain this product simply", "what are you all building", "what is this about", "purpose of the project", "what's the goal here",
        "what is mirage", "what does this do", "what is this project", "explain the project", "what problem does it solve",
        "who is this for", "elevator pitch", "what's PS-02", "tell me about this system", "ye kya hai",
        "introduce yourself and the product", "why did you build this", "what's the use case", "what is this tool for",
        "pitch me", "describe mirage in 30 seconds",
    ]},
    "how_overall": {"desc": "How MIRAGE works end to end: upload, witnesses, risk engine, tribunal, cure.", "examples": [
        "how does it work", "explain the pipeline", "architecture", "end to end flow", "what happens when I upload",
        "walk me through the system", "how does detection happen", "system design", "data flow", "flow diagram",
        "what happens behind the scenes", "how is the verdict made", "kaise kaam karta hai", "under the hood",
        "step by step how it works", "how do the parts fit together",
    ]},
    "witnesses": {"desc": "The five witnesses (voice, face, provenance, words, identity) and what each checks.", "examples": [
        "what are witnesses", "five witnesses", "what is the identity witness", "what does the provenance witness do",
        "explain the words witness", "list the witnesses", "what are the detectors", "which modalities",
        "what all do you check", "what signals do you look at",
    ]},
    "voice_how": {"desc": "How AI-generated / cloned voices are detected.", "examples": [
        "how do you detect a cloned voice", "how does voice deepfake detection work", "voice clone detection",
        "how can you tell an AI voice", "what models detect fake audio", "anti spoofing", "how is synthetic speech caught",
        "how do you know a voice is fake", "awaaz fake hai kaise pata chalta hai", "audio deepfake method",
        "two stage voice check", "explain the voice pipeline", "can you detect elevenlabs",
    ]},
    "image_how": {"desc": "How AI-generated images are detected (provenance witness, C2PA).", "examples": [
        "can you detect dall-e images", "spot a generated picture", "is this photo made by ai how do you know", "detect gemini or midjourney art", "ai photo kaise detect", "generated profile picture detection",
        "how do you detect AI images", "fake photo detection", "how do you know an image is generated",
        "midjourney detection", "image forensics", "c2pa", "content credentials", "how do you catch stable diffusion",
        "is the profile photo AI", "photo fake kaise pakadte ho", "ai image detector",
    ]},
    "face_how": {"desc": "How face swaps and deepfake videos are detected, including lip-sync.", "examples": [
        "mouth movement not matching audio", "lips out of sync", "dubbed video detection", "talking head fake", "detect a face swap on a call", "lip sync mismatch",
        "how do you detect face swaps", "deepfake video detection", "how about video calls", "lip sync detection",
        "syncnet", "how do you detect a fake zoom call", "face forgery", "video deepfake kaise pakdoge",
        "can you detect a deepfake video meeting", "gend", "how is the face checked",
    ]},
    "text_how": {"desc": "How scam messages, emails and transcripts are analysed (words witness).", "examples": [
        "how do you know an sms is a scam", "how do you judge a message", "how does the message checker work", "what makes you call a text fraudulent", "how do you analyse whatsapp messages", "scam text detection approach",
        "how do you detect scam messages", "how does text analysis work", "phishing detection", "nlp model",
        "how do you read emails", "how do you find tactics", "how is hinglish handled", "scam sms detection method",
        "email header checks", "spf dkim dmarc", "message analysis kaise hota hai",
    ]},
    "risk_engine": {"desc": "How the risk score is computed in general: request-aware fusion, policy rules, calibration.", "examples": [
        "how are the scores combined", "how do witnesses merge into one score", "how is the final number decided", "aggregation of scores", "how do you weigh the evidence", "single score from many models",
        "how is risk calculated", "explain the risk engine", "what is request aware", "noisy or", "fusion formula",
        "how do you combine witnesses", "why does the request matter", "policy rules", "calibration", "risk bands",
        "what makes something high vs medium", "shapley", "risk ka formula",
    ]},
    "tribunal": {"desc": "The AI Tribunal: agents that argue the case and explain the verdict.", "examples": [
        "who are the agents debating", "the bots that argue", "multi agent debate", "prosecutor defence judge", "agents arguing over the case", "explain the debate between agents",
        "what is the tribunal", "ai tribunal", "agents debate", "prosecutor and defence", "langgraph",
        "who are the agents", "explain the tribunal", "why have a debate",
    ]},
    "cure": {"desc": "The Cure Console: what happens after detection (contain, verify, recover, report, immunise).", "examples": [
        "what is the cure console", "what happens after detection", "response plan", "golden hour",
        "how do you help after a scam", "incident response", "contain verify recover", "exposure meter",
        "evidence pack", "what is the respond tab", "after detecting what next", "detection ke baad kya",
    ]},
    "redteam_how": {"desc": "The red-team lab: why MIRAGE generates synthetic scams, laundering, and the guardrails.", "examples": [
        "how do scammers evade detectors", "attacker evasion techniques", "how do fraudsters bypass deepfake detection", "attacker mindset", "why simulate attacks", "how are fakes laundered",
        "what is the red team lab", "why do you generate deepfakes", "attack lab", "is generating deepfakes ethical",
        "laundering", "how do attackers evade detection", "adversarial testing", "what does the attacker playbook say",
        "why create fake content", "red team kya hai",
    ]},
    "extension": {"desc": "The MIRAGE Shield Chrome extension (right-click checks, live tab audio, Gmail, WhatsApp Web).", "examples": [
        "chrome extension", "browser extension", "does it work in gmail", "whatsapp web", "mirage shield",
        "can I use it in chrome", "right click check", "extension kaise use kare", "how to install the extension",
        "real time in browser",
    ]},
    "live_shield": {"desc": "The live call shield: risk while a call is happening.", "examples": [
        "live call shield", "real time call detection", "can it detect during a call", "live monitoring",
        "risk river", "detect while on the phone", "live call me detect hoga", "streaming detection",
    ]},
    "liveness": {"desc": "The webcam liveness challenge.", "examples": [
        "liveness check", "how does liveness work", "prove I'm real on camera", "head movement challenge",
        "replay attack on webcam", "is the person live",
    ]},
    "trustbook": {"desc": "The Trustbook of known people, voiceprints, approval limits and the identity witness.", "examples": [
        "how do you know my boss's real voice", "where do you store known voices", "how does it recognise my cfo", "who is in the trusted contacts", "reference voice of colleagues", "voice enrolment",
        "what is trustbook", "voiceprint", "enrol my voice", "known contacts", "approval limits",
        "how do you know who the cfo is", "identity graph", "speaker verification", "consent for voiceprint",
    ]},
    "drills": {"desc": "Drill mode: consented simulated attacks to train staff.", "examples": [
        "drill mode", "phishing simulation", "train employees", "security awareness", "test my staff",
        "simulated attack on employees",
    ]},
    "accuracy": {"desc": "Measured accuracy and benchmarks per modality.", "examples": [
        "how accurate is it", "benchmarks", "auc", "what's the accuracy", "how good is the detection",
        "false positive rate", "eer", "results", "evaluation numbers", "kitna accurate hai", "performance metrics",
        "did you test it", "how well does it work on real data", "precision recall", "proof it works",
    ]},
    "limitations": {"desc": "Known weaknesses and what MIRAGE cannot do yet.", "examples": [
        "what can break it", "how can someone defeat it", "what are you bad at", "where do you go wrong", "weak points", "can it be beaten", "what does it miss",
        "limitations", "weaknesses", "what can't it detect", "where does it fail", "failure cases", "drawbacks",
        "what's not working", "can it be fooled", "kya kami hai", "blind spots", "be honest about the gaps",
        "what are the risks of relying on it", "known issues",
    ]},
    "noise": {"desc": "How noisy or compressed audio is handled.", "examples": [
        "whatsapp voice note compression", "does low bitrate affect it", "railway station background", "crowded place call", "audio quality problems", "traffic noise in the background",
        "what about background noise", "noisy calls", "does compression break it", "street noise",
        "phone line quality", "whatsapp compression", "noise robustness", "what if the audio is bad",
        "shor wali call", "low quality audio",
    ]},
    "model_list": {"desc": "Which pretrained models MIRAGE uses, or details of one named model.", "examples": [
        "what models are under the hood", "model wise what's inside", "what neural networks power it", "names of the detectors", "which deep learning models", "what's DF arena", "explain gend model",
        "which models do you use", "list the models", "what is df arena", "tell me about gend", "what is NII antideepfake",
        "community forensics", "which AI models", "model cards", "what's wavlm for", "tech behind detection",
        "what is mdeberta used for", "which LLM", "model ka naam", "swinv2", "yunet",
    ]},
    "no_training": {"desc": "Whether models were trained; the no-training, pretrained-ensemble approach.", "examples": [
        "did you train the model", "is it pretrained", "why not train your own", "did you fine tune",
        "what data did you train on", "how did you build the models", "is this your own model", "trained locally?",
        "no training approach", "kya model train kiya",
    ]},
    "privacy": {"desc": "Privacy, data handling, consent and ethics.", "examples": [
        "what happens to the files I upload", "are uploads stored", "who can see my recordings",
        "does data go to the internet", "can it work offline", "runs locally?", "is my audio uploaded anywhere", "does anything leave my machine", "is it cloud based", "offline mode",
        "privacy", "where is my data stored", "is it sent to the cloud", "gdpr", "dpdp act", "consent",
        "ethics", "do you keep recordings", "is it offline", "data security", "audit log", "chain of custody",
    ]},
    "stack": {"desc": "The tech stack and how to run it.", "examples": [
        "what language is it coded in", "programming languages", "what frameworks", "which libraries", "built using what", "python or javascript",
        "tech stack", "what is it built with", "frontend backend", "fastapi", "react", "how do I run it",
        "setup instructions", "deploy", "hardware needed", "does it need a gpu", "languages used",
    ]},
    "scam_types": {"desc": "Explain a scam type (digital arrest, CFO fraud, family emergency, KYC, investment).", "examples": [
        "what is digital arrest", "explain ceo fraud", "what is business email compromise", "family emergency scam",
        "kyc scam", "investment scam", "types of deepfake scams", "what scams do you cover", "what is vishing",
        "otp fraud", "gift card scam", "sextortion", "job scam", "what is a voice clone scam",
    ]},
    "scammed_help": {"desc": "The user already paid or shared a code and needs emergency help.", "examples": [
        "paise bhej diye", "maine paise de diye scammer ko", "my mother sent money to a fraudster", "already transferred", "I gave them the code", "lost money to a scam", "fraud ho gaya",
        "I already paid", "I sent the money", "I shared my OTP", "I've been scammed", "money gone what do I do",
        "paisa chala gaya", "I got cheated", "they took my money", "transferred 50000 to a scammer",
        "I installed anydesk", "help I was tricked", "my father paid a fake caller",
    ]},
    "casebook": {"desc": "The casebook: guidance documents searched by hybrid retrieval (RAG) to cite policies and playbooks.", "examples": [
        "what is the casebook", "rag", "retrieval augmented generation", "how do you cite policies", "knowledge base",
        "where does the guidance come from", "document search", "bm25", "how are citations made", "cert-in guidance documents",
        "playbooks and policies", "what's the role of retrieval",
    ]},
    "compare_tools": {"desc": "How MIRAGE differs from existing tools; the unique selling points.", "examples": [
        "why is this better", "better than existing solutions", "what do others lack", "advantage over other products", "how does it beat current tools", "edge over competition",
        "how is it different", "competitors", "usp", "why not use existing tools", "what's unique", "innovation",
        "what makes it special", "compared to truecaller", "existing solutions", "why should judges pick this",
        "novelty",
    ]},

    # ---- conversation -------------------------------------------------------------------------------------------
    "help": {"desc": "What the assistant can do.", "examples": [
        "what can I do with this", "what all can you help with", "how can you help me", "show me what you can do", "features list", "what do you offer",
        "help", "what can you do", "what can I ask", "capabilities", "options", "menu", "how do I use you",
        "what are you able to do", "guide me", "kya kar sakte ho", "commands",
    ]},
    "assistant_how": {"desc": "How this assistant itself works (local router, grounded answers).", "examples": [
        "are you just chatgpt", "is this gpt", "are you a wrapper", "how do you answer", "is it an llm answering", "do you make things up", "how do you know these facts",
        "how do you work", "are you chatgpt", "are you an llm", "how were you trained", "do you hallucinate",
        "is this answer from the internet", "where do your answers come from", "are you using openai",
        "which brain do you use", "can you make mistakes",
    ]},
    "greet": {"desc": "Greeting.", "examples": [
        "hey mirage", "hi mirage", "hello there", "hi assistant", "good evening", "hey buddy","hi", "hello", "hey", "good morning", "namaste", "yo", "hii", "hey there", "hola"]},
    "thanks": {"desc": "Thanks or goodbye.", "examples": ["thanks", "thank you", "great", "cool", "ok thanks", "bye", "awesome", "shukriya", "nice", "perfect"]},
    "out_of_scope": {"desc": "Unrelated to MIRAGE, scams or deepfakes.", "examples": [
        "tell me about bollywood", "latest movie gossip", "who is the best actor", "football scores", "tell me about virat kohli", "suggest a holiday destination", "what should I eat tonight",
        "what's the capital of japan", "who invented the telephone", "translate hello to french", "how tall is mount everest", "solve this equation", "what's the time",
        "what's the weather", "tell me a joke", "who won the cricket match", "write me a poem", "what is 2+2",
        "recommend a movie", "what's bitcoin price", "who is the prime minister", "cook pasta recipe",
        "play music", "book a cab",
    ]},
}

# phrases that make a short message a follow-up about the current subject
PRONOUNS = {"it", "this", "that", "its", "it's", "ye", "yeh", "isko", "iska", "isme", "wo", "woh", "this one", "the call",
            "the voice", "the image", "the video", "the message", "the result", "the score", "he", "she", "they"}
