# Measured results

Produced by `backend/scripts/verify_demo_inputs.py` against the running API (01 Nov 2026).

| Folder | Input | MIRAGE result |
|---|---|---|
| 01_voice_check | `01_ai_cfo_wire_whatsapp.ogg` | AI-generated voice (0.97) · asks payment · CRITICAL voice clone scam |
| 01_voice_check | `02_ai_family_emergency_hinglish.ogg` | AI-generated voice (0.98) · asks payment · CRITICAL voice clone scam |
| 01_voice_check | `03_ai_townhall_announcement_harmless.mp3` | AI-generated voice (0.97) · asks none · LOW synthetic benign |
| 01_voice_check | `04_human_voice_audiobook_librispeech.wav` | Human voice (0.00) · asks none · LOW benign |
| 01_voice_check | `05_ai_otp_helpdesk_noisy_street.wav` | AI-generated voice (0.96, noisy) · asks credential · CRITICAL voice clone scam |
| 07_live_call_shield | `01_scam_call_escalating_ai_voice.wav` | AI-generated voice (0.99) · asks payment · CRITICAL voice clone scam |
| 07_live_call_shield | `02_benign_call_human_voice.wav` | Human voice (0.00) · asks none · LOW benign |
| 02_image_check | `01_ai_police_officer_portrait.jpg` | Likely AI-generated or manipulated (1.00) |
| 02_image_check | `02_ai_vendor_headshot.jpg` | Likely AI-generated or manipulated (1.00) |
| 02_image_check | `03_ai_investment_spokesperson.jpg` | Likely AI-generated or manipulated (1.00) |
| 02_image_check | `04_real_photo_astronaut_nasa.jpg` | Likely authentic (0.03) |
| 02_image_check | `05_real_photo_coffee.jpg` | Likely authentic (0.02) |
| 03_video_check | `01_ai_avatar_digital_arrest_officer.mp4` | Likely AI-generated or manipulated (0.98) |
| 03_video_check | `02_ai_avatar_investment_endorsement.mp4` | Likely AI-generated or manipulated (0.93) |
| 03_video_check | `03_ai_meeting_lipsync_drift.mp4` | Likely AI-generated or manipulated (1.00) |
| 03_video_check | `04_real_face_human_voice_benign.mp4` | Likely authentic (0.07) |
| 04_messages | `01_digital_arrest_sms.txt` | CRITICAL · Digital arrest · fake police or agency · tactics authority, fear, secrecy, urgency |
| 04_messages | `02_bank_kyc_otp_phishing.txt` | HIGH · Credential theft · OTP, password or PIN · tactics authority, fear, urgency |
| 04_messages | `03_papa_emergency_hinglish.txt` | HIGH · Family emergency scam · tactics channel_switch, fear, secrecy, urgency, authority |
| 04_messages | `04_investment_whatsapp_group.txt` | HIGH · Prize, refund, job or investment lure · tactics reward |
| 04_messages | `05_benign_meeting_reminder.txt` | LOW · No scam pattern · tactics none |
| 04_messages | `06_legit_bank_otp_notice.txt` | LOW · No scam pattern · tactics none |
| 04_messages | `07_whatsapp_cfo_chat_screenshot.png` | case MRG-0529 → HIGH 93 |
| 05_emails | `01_vendor_bank_change_bec.eml` | case MRG-0530 → HIGH 99 |
| 05_emails | `02_ceo_gift_cards_urgent.eml` | case MRG-0531 → HIGH 96 |
| 05_emails | `03_password_expiry_phishing.eml` | case MRG-0532 → HIGH 97 |
| 05_emails | `04_benign_hr_newsletter.eml` | case MRG-0533 → LOW 27 |
| 06_full_investigations | `A_cfo_voice_wire` | case MRG-0534 → HIGH 100 (expected HIGH / CRITICAL · voice-clone payment fraud) |
| 06_full_investigations | `B_digital_arrest_video` | case MRG-0535 → HIGH 100 (expected HIGH · digital arrest, synthetic face and voice) |
| 06_full_investigations | `C_family_emergency` | case MRG-0536 → HIGH 100 (expected HIGH · family emergency scam) |
| 06_full_investigations | `D_vendor_bec_email` | case MRG-0537 → HIGH 100 (expected HIGH · vendor BEC with AI headshot) |
| 06_full_investigations | `E_harmless_ai_townhall` | case MRG-0538 → LOW 30 (expected LOW · synthetic but harmless) |
