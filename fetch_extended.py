import os
import urllib.request
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

z = 8
x_min, x_max = 148, 156
y_min, y_max = 97, 111

width_tiles = x_max - x_min + 1
height_tiles = y_max - y_min + 1

os.makedirs("temp_tiles", exist_ok=True)

def fetch_tile(task):
    url, filename, is_elev = task
    if not os.path.exists(filename):
        success = False
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response, open(filename, 'wb') as out_file:
                    out_file.write(response.read())
                success = True
                break
            except Exception as e:
                import time
                time.sleep(1)
        if not success:
            img = Image.new('RGB', (256, 256), color=(0,0,0) if is_elev else (0,0,50))
            img.save(filename)
    return filename

tasks = []
for x in range(x_min, x_max + 1):
    for y in range(y_min, y_max + 1):
        elev_url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        elev_file = f"temp_tiles/elev_{z}_{x}_{y}.png"
        tasks.append((elev_url, elev_file, True))
        
        sat_url = f"https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        sat_file = f"temp_tiles/sat_{z}_{x}_{y}.jpg"
        tasks.append((sat_url, sat_file, False))

print(f"Fetching {len(tasks)} tiles with 20 threads...")
with ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(fetch_tile, t) for t in tasks]
    for i, future in enumerate(as_completed(futures)):
        pass
print("All fetched! Now compositing...")

sat_img = Image.new('RGB', (width_tiles * 256, height_tiles * 256))
elev_img = Image.new('RGB', (width_tiles * 256, height_tiles * 256))

for x in range(x_min, x_max + 1):
    for y in range(y_min, y_max + 1):
        px = (x - x_min) * 256
        py = (y - y_min) * 256
        
        try:
            e_tile = Image.open(f"temp_tiles/elev_{z}_{x}_{y}.png")
            elev_img.paste(e_tile, (px, py))
        except: pass
            
        try:
            s_tile = Image.open(f"temp_tiles/sat_{z}_{x}_{y}.jpg")
            sat_img.paste(s_tile, (px, py))
        except: pass

sat_img.save("data/sat_extended.jpg", quality=85)
elev_img.save("data/elev_extended.png")
print("Saved data/sat_extended.jpg and data/elev_extended.png!")
