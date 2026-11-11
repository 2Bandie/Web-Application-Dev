from django.db import migrations


def seed(apps, schema_editor):
    Song = apps.get_model("arena", "Song")
    for title, bpm, spacing in [("Afterglow", 100, 600), ("Neon Circuit", 140, 429)]:
        chart = [
            {"time": 1500 + i * spacing, "lane": [0, 1, 2, 3, 0, 2, 1, 3][i % 8]}
            for i in range(32)
        ]
        Song.objects.get_or_create(
            title=title,
            defaults={
                "bpm": bpm,
                "chart": chart,
                "duration_ms": chart[-1]["time"] + 1500,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("arena", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
