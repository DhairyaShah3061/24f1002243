"""What a trekker needs to know about a trek: duration, what to carry, where to report.

Shown on the trek page before booking and reused in the daily reminder email.
"""

PACKING_LIST = [
    "Valid photo ID (original + one photocopy)",
    "Medical fitness certificate",
    "Trekking shoes with good grip, and a spare pair of socks per day",
    "Warm layers: thermals, fleece and a down/padded jacket",
    "Rain jacket or poncho, and a backpack cover",
    "Water bottle (2 litres), sunscreen, sunglasses and a cap",
    "Headlamp with spare batteries and personal medicines",
]

EXTRA_BY_DIFFICULTY = {
    "Moderate": ["Trekking pole (one or two) and a 40-50 L rucksack"],
    "Hard": [
        "Trekking poles, gaiters and a 50-60 L rucksack",
        "Gloves, woollen cap and an extra pair of thermals for the cold nights",
        "Electrolyte sachets and energy snacks for the long climbing days",
    ],
}

DIFFICULTY_NOTE = {
    "Easy": "Suitable for first-time trekkers with normal fitness. Short walking days on well-marked trails.",
    "Moderate": "Needs regular walking or jogging in the weeks before. Expect 5-7 hours of walking on most days.",
    "Hard": "Long days at high altitude. Build up stamina for at least a month before and check with your doctor.",
}

REPORTING_INSTRUCTIONS = (
    "Please report at the base camp by 7:00 AM on the start date. "
    "Carry your booking confirmation and keep your phone reachable the day before."
)


def trek_guide(trek):
    days = trek.duration_days
    return {
        "days": days,
        "nights": max(days - 1, 0),
        "difficulty_note": DIFFICULTY_NOTE.get(trek.difficulty, ""),
        "what_to_carry": PACKING_LIST + EXTRA_BY_DIFFICULTY.get(trek.difficulty, []),
        "reporting": REPORTING_INSTRUCTIONS,
    }
