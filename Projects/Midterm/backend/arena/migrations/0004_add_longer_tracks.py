from django.db import migrations


def add_tracks(apps, schema_editor):
    Song = apps.get_model("arena", "Song")
    Song.objects.filter(title="Neon Circuit").update(difficulty="normal")
    # Times are derived from the musical grid, avoiding accumulated rounding drift.
    house_pattern = [0, 2, 1, 3, 1, 2, 0, 3, 2, 0, 3, 1, 0, 1, 3, 2]
    chart = []
    for beat in range(96):
        chart.append(
            {"time": 1500 + round(beat * 60000 / 128), "lane": house_pattern[beat % 16]}
        )
        if beat % 16 in (6, 7, 12, 14):
            chart.append(
                {
                    "time": 1500 + round((beat + 0.5) * 60000 / 128),
                    "lane": (house_pattern[beat % 16] + 2) % 4,
                }
            )
    Song.objects.get_or_create(
        title="Midnight Drive",
        defaults={
            "bpm": 128,
            "difficulty": "hard",
            "arrangement": "house",
            "chart": chart,
            "duration_ms": 1500 + round(96 * 60000 / 128) + 1500,
        },
    )
    patterns = [
        [0, 2, 1, 3, 0, 1, 2, 3],
        [3, 1, 2, 0, 3, 2, 1, 0],
        [0, 3, 1, 2, 3, 0, 2, 1],
        [1, 0, 2, 3, 2, 1, 3, 0],
    ]
    chart = []
    for step in range(320):
        # Brief gaps between eight-bar phrases; the final section is a sustained stream.
        if step < 256 and step % 64 in (59, 61, 63):
            continue
        pattern = patterns[(step // 64) % len(patterns)]
        chart.append(
            {"time": 1500 + round(step * 60000 / 176 / 2), "lane": pattern[step % 8]}
        )
    Song.objects.get_or_create(
        title="Overdrive",
        defaults={
            "bpm": 176,
            "difficulty": "expert",
            "arrangement": "breakbeat",
            "chart": chart,
            "duration_ms": 1500 + round(160 * 60000 / 176) + 1500,
        },
    )


class Migration(migrations.Migration):
    dependencies = [
        ("arena", "0003_room_mode_song_arrangement_song_difficulty_and_more")
    ]
    # Preserve catalog entries and historical performances on rollback.
    operations = [migrations.RunPython(add_tracks, migrations.RunPython.noop)]
