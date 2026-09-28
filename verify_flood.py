import math
from PIL import Image

def lat2y(lat, z):
    return (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * (2**z)

def lon2x(lon, z):
    return (lon + 180) / 360 * (2**z)

# Load elevation image
img = Image.open('data/elev.png')
pixels = img.load()
width, height = img.size

# Function to get elevation
def get_elev(x, y):
    r, g, b = pixels[x, y]
    return (r * 256.0 + g + b / 256.0) - 32768.0

# Define specific points
points = {
    'Tel Aviv (Coastal)': (34.78, 32.08),
    'Gaza (Coastal)': (34.46, 31.50),
    'Jerusalem (Mountain)': (35.21, 31.76),
    'Dead Sea (Rift Valley)': (35.45, 31.50),
    'Eilat (Red Sea Coast)': (34.95, 29.55)
}

z = 8
base_x = 151
base_y = 102

print("=== ELEVATION CHECK ===")
for name, (lon, lat) in points.items():
    px = int((lon2x(lon, z) - base_x) * 256)
    py = int((lat2y(lat, z) - base_y) * 256)
    
    if 0 <= px < width and 0 <= py < height:
        elev = get_elev(px, py)
        print(f"{name:25}: X={px:3}, Y={py:3} => {elev:.1f} meters")
    else:
        print(f"{name:25}: OUT OF BOUNDS")

# Flood fill test function
def simulate_flood(sea_level):
    mask = bytearray(width * height)
    queue = [(0, 0)] # Start Mediterranean
    mask[0] = 1
    
    # Red Sea seed
    if get_elev(400, height - 1) <= sea_level:
        queue.append((400, height - 1))
        mask[(height - 1) * width + 400] = 1
    
    head = 0
    while head < len(queue):
        x, y = queue[head]
        head += 1
        
        for dx, dy in [(-1,0), (1,0), (0,-1), (0,1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                idx = ny * width + nx
                if mask[idx] == 0:
                    if get_elev(nx, ny) <= sea_level:
                        mask[idx] = 1
                        queue.append((nx, ny))
    return mask

print("\n=== FLOODING SIMULATION RESULTS ===")
test_levels = [0, 50, 400, 1000]

for level in test_levels:
    print(f"\n--- Sea Level: {level}m ---")
    mask = simulate_flood(level)
    
    for name, (lon, lat) in points.items():
        px = int((lon2x(lon, z) - base_x) * 256)
        py = int((lat2y(lat, z) - base_y) * 256)
        
        if 0 <= px < width and 0 <= py < height:
            idx = py * width + px
            is_flooded = mask[idx] == 1
            print(f"{name:25}: {'[SOAKED]' if is_flooded else '[DRY]'}")
