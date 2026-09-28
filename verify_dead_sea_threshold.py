import numpy as np
from PIL import Image

# Load the elevation image
elev_img = Image.open('data/elev.png')
img_w, img_h = elev_img.size
elev_data = np.array(elev_img)

# Decode mapzen terrarium (R * 256 + G + B / 256) - 32768
r = elev_data[:,:,0].astype(np.float32)
g = elev_data[:,:,1].astype(np.float32)
b = elev_data[:,:,2].astype(np.float32)
elevation = (r * 256.0 + g + b / 256.0) - 32768.0

def test_flood(sea_level):
    mask = np.zeros((img_h, img_w), dtype=np.uint8)
    queue = []
    
    # Seed top-left (Mediterranean)
    if elevation[0, 0] <= sea_level:
        queue.append((0, 0))
        mask[0, 0] = 1
        
    # Seed bottom edge (Red Sea)
    red_sea_x = 400
    if elevation[img_h-1, red_sea_x] <= sea_level:
        queue.append((img_h-1, red_sea_x))
        mask[img_h-1, red_sea_x] = 1
        
    head = 0
    dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    
    while head < len(queue):
        r, c = queue[head]
        head += 1
        
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < img_h and 0 <= nc < img_w:
                if mask[nr, nc] == 0 and elevation[nr, nc] <= sea_level:
                    mask[nr, nc] = 1
                    queue.append((nr, nc))
                    
    # Dead Sea approx location
    ds_r = int(img_h * 0.50)
    ds_c = int(img_w * 0.76)
    return mask[ds_r, ds_c] == 1

# Binary search the threshold
low = 0
high = 200
exact_threshold = -1

for level in range(low, high + 1):
    if test_flood(level):
        exact_threshold = level
        break

print(f"The exact sea level required to flood the Dead Sea basin is: {exact_threshold} meters")
