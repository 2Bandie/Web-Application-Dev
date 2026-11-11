from django.db import migrations


def rename_track(apps, schema_editor):
    # Update the existing row so chart IDs and historical results remain linked.
    Song = apps.get_model("arena", "Song")
    Song.objects.filter(title="Afterglow").update(title="Glow")


def reverse_name(apps, schema_editor):
    Song = apps.get_model("arena", "Song")
    Song.objects.filter(title="Glow").update(title="Afterglow")


class Migration(migrations.Migration):
    dependencies = [("arena", "0005_room_paused_at_alter_room_status")]
    operations = [migrations.RunPython(rename_track, reverse_name)]
