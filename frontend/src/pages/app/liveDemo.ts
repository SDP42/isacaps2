/** Recorded analysis for the four demo calls, replayed in sync with the audio so the demo never waits on the GPU.
 * spoof: the voice ensemble on each 3 s window of the sample (/v1/live/chunk). text: the script the sample was
 * generated from (Whisper garbles 3 s Hinglish slices). tactics/action/manipulation/amount/spans: the words witness
 * on the transcript so far, exactly as live mode computes them. Regenerate with backend/scripts/record_live_demo.py. */
export interface DemoWindow { spoof: number | null; text: string; tactics: string[]; action: string; manipulation: number; amount: number | null; spans: { kind: string; text: string }[] }
export interface DemoCall { seconds: number; windows: DemoWindow[] }

export const DEMO_CALLS: Record<string, DemoCall> = {
  "cfo_voice_note.wav": {
    "seconds": 16.57,
    "windows": [
      {
        "spoof": 1.0,
        "text": "Hi, it's Rajesh. I'm in a",
        "tactics": [],
        "action": "none",
        "manipulation": 0.432,
        "amount": null,
        "spans": []
      },
      {
        "spoof": 1.0,
        "text": "board meeting and can't take calls.",
        "tactics": [
          "authority",
          "channel_switch"
        ],
        "action": "none",
        "manipulation": 0.762,
        "amount": null,
        "spans": [
          {
            "kind": "authority",
            "text": "board meeting"
          },
          {
            "kind": "channel_switch",
            "text": "can't take calls"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "Please process 48,50,000 rupees to the",
        "tactics": [
          "authority",
          "channel_switch"
        ],
        "action": "payment",
        "manipulation": 0.908,
        "amount": 4850000,
        "spans": [
          {
            "kind": "authority",
            "text": "board meeting"
          },
          {
            "kind": "channel_switch",
            "text": "can't take calls"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "new vendor account before 4 PM.",
        "tactics": [
          "authority",
          "channel_switch",
          "urgency"
        ],
        "action": "payment",
        "manipulation": 0.948,
        "amount": 4850000,
        "spans": [
          {
            "kind": "authority",
            "text": "board meeting"
          },
          {
            "kind": "channel_switch",
            "text": "can't take calls"
          },
          {
            "kind": "urgency",
            "text": "before 4 PM"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "Very urgent. Keep this between us,",
        "tactics": [
          "authority",
          "channel_switch",
          "secrecy",
          "urgency"
        ],
        "action": "payment",
        "manipulation": 0.994,
        "amount": 4850000,
        "spans": [
          {
            "kind": "authority",
            "text": "board meeting"
          },
          {
            "kind": "channel_switch",
            "text": "can't take calls"
          },
          {
            "kind": "urgency",
            "text": "before 4 PM"
          },
          {
            "kind": "urgency",
            "text": "Very urgent"
          },
          {
            "kind": "secrecy",
            "text": "Keep this between us"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "audit wale ko abhi mat batana.",
        "tactics": [
          "authority",
          "bypass",
          "channel_switch",
          "secrecy",
          "urgency"
        ],
        "action": "payment",
        "manipulation": 1.0,
        "amount": 4850000,
        "spans": [
          {
            "kind": "authority",
            "text": "board meeting"
          },
          {
            "kind": "channel_switch",
            "text": "can't take calls"
          },
          {
            "kind": "urgency",
            "text": "before 4 PM"
          },
          {
            "kind": "urgency",
            "text": "Very urgent"
          },
          {
            "kind": "secrecy",
            "text": "Keep this between us"
          },
          {
            "kind": "bypass",
            "text": "audit wale ko"
          },
          {
            "kind": "urgency",
            "text": "abhi"
          },
          {
            "kind": "secrecy",
            "text": "mat batana"
          }
        ]
      }
    ]
  },
  "papa_voice_note.wav": {
    "seconds": 11.22,
    "windows": [
      {
        "spoof": 1.0,
        "text": "Beta main hoon, accident ho",
        "tactics": [
          "fear"
        ],
        "action": "none",
        "manipulation": 0.805,
        "amount": null,
        "spans": [
          {
            "kind": "fear",
            "text": "accident"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "gaya hai, phone toot gaya.",
        "tactics": [
          "channel_switch",
          "fear"
        ],
        "action": "none",
        "manipulation": 0.866,
        "amount": null,
        "spans": [
          {
            "kind": "fear",
            "text": "accident"
          },
          {
            "kind": "channel_switch",
            "text": "phone toot gaya"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "Paise abhi bhejo, ₹75,000.",
        "tactics": [
          "channel_switch",
          "fear",
          "urgency"
        ],
        "action": "payment",
        "manipulation": 0.947,
        "amount": 75000,
        "spans": [
          {
            "kind": "fear",
            "text": "accident"
          },
          {
            "kind": "channel_switch",
            "text": "phone toot gaya"
          },
          {
            "kind": "urgency",
            "text": "abhi"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "Kisi ko mat batana please.",
        "tactics": [
          "channel_switch",
          "fear",
          "secrecy",
          "urgency"
        ],
        "action": "payment",
        "manipulation": 0.994,
        "amount": 75000,
        "spans": [
          {
            "kind": "fear",
            "text": "accident"
          },
          {
            "kind": "channel_switch",
            "text": "phone toot gaya"
          },
          {
            "kind": "urgency",
            "text": "abhi"
          },
          {
            "kind": "secrecy",
            "text": "Kisi ko mat batana"
          }
        ]
      }
    ]
  },
  "it_helpdesk.wav": {
    "seconds": 11.0,
    "windows": [
      {
        "spoof": 1.0,
        "text": "IT team se bol raha hoon.",
        "tactics": [
          "authority"
        ],
        "action": "none",
        "manipulation": 0.589,
        "amount": null,
        "spans": [
          {
            "kind": "authority",
            "text": "IT team"
          },
          {
            "kind": "authority",
            "text": "bol raha hoon"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "Aapka account reset ho raha hai. Jo",
        "tactics": [
          "authority"
        ],
        "action": "none",
        "manipulation": 0.873,
        "amount": null,
        "spans": [
          {
            "kind": "authority",
            "text": "IT team"
          },
          {
            "kind": "authority",
            "text": "bol raha hoon"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "OTP aaya hai woh bata do jaldi,",
        "tactics": [
          "authority",
          "urgency"
        ],
        "action": "credential",
        "manipulation": 0.903,
        "amount": null,
        "spans": [
          {
            "kind": "authority",
            "text": "IT team"
          },
          {
            "kind": "authority",
            "text": "bol raha hoon"
          },
          {
            "kind": "urgency",
            "text": "jaldi"
          }
        ]
      },
      {
        "spoof": 1.0,
        "text": "10 minute mein lock ho jayega.",
        "tactics": [
          "authority",
          "urgency"
        ],
        "action": "credential",
        "manipulation": 0.902,
        "amount": null,
        "spans": [
          {
            "kind": "authority",
            "text": "IT team"
          },
          {
            "kind": "authority",
            "text": "bol raha hoon"
          },
          {
            "kind": "urgency",
            "text": "jaldi"
          },
          {
            "kind": "urgency",
            "text": "lock ho jayega"
          }
        ]
      }
    ]
  },
  "townhall_avatar.wav": {
    "seconds": 7.53,
    "windows": [
      {
        "spoof": 1.0,
        "text": "Join us for the quarterly townhall",
        "tactics": [],
        "action": "none",
        "manipulation": 0.005,
        "amount": null,
        "spans": []
      },
      {
        "spoof": 1.0,
        "text": "on Friday at 4 PM in the",
        "tactics": [],
        "action": "none",
        "manipulation": 0.003,
        "amount": null,
        "spans": []
      },
      {
        "spoof": 0.997,
        "text": "main auditorium. Snacks will be served!",
        "tactics": [],
        "action": "none",
        "manipulation": 0.006,
        "amount": null,
        "spans": []
      }
    ]
  }
};
