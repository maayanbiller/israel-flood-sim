import os
import requests
from PIL import Image
from io import BytesIO

os.makedirs('data', exist_ok=True)

# Zoom 8 covers a good amount of detail while keeping the texture size manageable
Z = 8
# X covers longitudes 32.3 to 36.5 (From Mediterranean sea to Jordan)
X_RANGE = range(151, 154) # 3 columns
# Y covers latitudes 29.5 to 33.5 (Eilat to North Israel/Lebanon)
Y_RANGE = range(102, 107) # 5 rows

W = 256
img_w = len(X_RANGE) * W
img_h = len(Y_RANGE) * W

elev_img = Image.new('RGB', (img_w, img_h))
sat_img = Image.new('RGB', (img_w, img_h))

print(f"Stitching {len(X_RANGE)}x{len(Y_RANGE)} grid ({img_w}x{img_h} pixels)...")

for j, y in enumerate(Y_RANGE):
    for i, x in enumerate(X_RANGE):
        print(f"Fetching tile {x}, {y}...")
        
        # Terrain (Mapzen on AWS)
        elev_url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
        res = requests.get(elev_url)
        if res.status_code == 200:
            tile = Image.open(BytesIO(res.content)).convert('RGB')
            elev_img.paste(tile, (i * W, j * W))
            
        # Satellite (ArcGIS) - Format is Z/Y/X
        sat_url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{y}/{x}"
        res = requests.get(sat_url)
        if res.status_code == 200:
            tile = Image.open(BytesIO(res.content)).convert('RGB')
            sat_img.paste(tile, (i * W, j * W))

elev_img.save('data/elev.png')
sat_img.save('data/sat.jpg')
print("Successfully generated full country stitched images!")
