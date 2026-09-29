"""Assemble the Blender QA renders into a labeled review sheet (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

folder = Path(__file__).resolve().parents[2] / 'public/model/previews'
files = sorted(folder.glob('[0-9][0-9]_*.png'))
sheet = Image.new('RGB', (1500, 4 * 375), '#20282b')
draw = ImageDraw.Draw(sheet)
for i, path in enumerate(files):
    image = Image.open(path).convert('RGB')
    image.thumbnail((500, 345))
    x, y = (i % 3) * 500, (i // 3) * 375
    sheet.paste(image, (x, y + 25))
    draw.text((x + 14, y + 8), path.stem.replace('_', ' '), fill='#eef1ef')
sheet.save(folder / 'contact_sheet.png')
