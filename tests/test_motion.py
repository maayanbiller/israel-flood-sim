import asyncio
import os
import glob
import shutil
from playwright.async_api import async_playwright

async def main():
    print("Starting motion testing browser...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    vid_dir = os.path.join(script_dir, "videos")
    os.makedirs(vid_dir, exist_ok=True)
    
    async with async_playwright() as p:
        # Use headless=False so WebGL doesn't crash, but we record the context
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            record_video_dir=vid_dir,
            viewport={'width': 1280, 'height': 720}
        )
        page = await context.new_page()

        print("Navigating to simulation...")
        await page.goto("http://localhost:8080/index.html", wait_until="networkidle")
        
        try:
            await page.wait_for_selector("#controls", state="visible", timeout=15000)
            print("Engine initialized. Recording motion...")
        except:
            print("Timeout waiting for engine.")
            await context.close()
            await browser.close()
            return
            
        # Give it a second to stabilize
        await page.wait_for_timeout(1000)

        # 1. Simulate Rotation (Left Click Drag)
        print("Testing rotation...")
        await page.mouse.move(640, 360)
        await page.mouse.down()
        await page.mouse.move(640, 600, steps=20) # Drag down to test ground collision
        await page.wait_for_timeout(500)
        await page.mouse.move(300, 600, steps=20) # Drag left
        await page.mouse.up()
        
        await page.wait_for_timeout(1000)
        
        # 2. Simulate Panning (Right Click Drag)
        print("Testing panning...")
        await page.mouse.move(640, 360)
        await page.mouse.down(button="right")
        await page.mouse.move(640, 200, steps=20) # Drag up to pan forward
        await page.wait_for_timeout(500)
        await page.mouse.move(800, 200, steps=20) # Drag right to pan left
        await page.mouse.up()
        
        await page.wait_for_timeout(2000)
        
        # Close to save video
        await context.close()
        await browser.close()
        
        # Rename the video
        videos = glob.glob(os.path.join(vid_dir, "*.webm"))
        if videos:
            latest = max(videos, key=os.path.getctime)
            target = os.path.join(script_dir, "motion_test.webm")
            if os.path.exists(target):
                os.remove(target)
            shutil.move(latest, target)
            print(f"Motion video saved to {target}")

if __name__ == "__main__":
    asyncio.run(main())
