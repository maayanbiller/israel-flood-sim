import asyncio
import os
import glob
import shutil
import math
from playwright.async_api import async_playwright

async def main():
    print("Starting advanced motion stress test...")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    vid_dir = os.path.join(script_dir, "videos")
    os.makedirs(vid_dir, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            record_video_dir=vid_dir,
            viewport={'width': 1280, 'height': 720}
        )
        page = await context.new_page()

        print("Navigating...")
        await page.goto("http://localhost:8080/flood_fill.html", wait_until="networkidle")
        
        try:
            await page.wait_for_selector("#controls", state="visible", timeout=15000)
        except:
            print("Timeout")
            return
            
        await page.wait_for_timeout(1000)

        # Zoom all the way out (Mouse wheel is tricky in playwright, so we simulate a pinch or just use evaluate to set camera)
        # It's easier to just use page.evaluate to stress test the camera positions!
        # OrbitControls will fight direct camera modifications unless we change controls.target and controls.object.position, then controls.update()
        
        print("Stress testing extreme camera angles...")
        await page.evaluate("""
            window.stressTest = async function() {
                // 1. Zoom all the way out, look at horizon
                camera.position.set(0, 50, 150);
                controls.target.set(0, 0, 0);
                controls.update();
                await new Promise(r => setTimeout(r, 2000));
                
                // 2. Rotate 360 degrees slowly at max zoom
                for(let i=0; i<=60; i++) {
                    let angle = (i / 60) * Math.PI * 2;
                    camera.position.set(Math.sin(angle)*150, 50, Math.cos(angle)*150);
                    controls.update();
                    await new Promise(r => setTimeout(r, 50));
                }
                
                // 3. Pan to the extreme edge (e.g. North East corner)
                controls.target.set(40, 0, -80);
                camera.position.set(40 + 100, 30, -80 + 100);
                controls.update();
                await new Promise(r => setTimeout(r, 2000));
                
                // 4. Look closely at the ground edge
                camera.position.set(40, 5, -80);
                controls.update();
                await new Promise(r => setTimeout(r, 2000));
                
                // 5. Flood the map to 100m and check water bounds
                document.getElementById('seaLevel').value = 100;
                document.getElementById('seaLevel').dispatchEvent(new Event('input'));
                camera.position.set(0, 80, 0);
                controls.target.set(0, 0, -50);
                controls.update();
                await new Promise(r => setTimeout(r, 3000));
            };
        """)
        
        await page.evaluate("window.stressTest()")
        
        await context.close()
        await browser.close()
        
        videos = glob.glob(os.path.join(vid_dir, "*.webm"))
        if videos:
            latest = max(videos, key=os.path.getctime)
            target = os.path.join(script_dir, "motion_stress_test.webm")
            if os.path.exists(target):
                os.remove(target)
            shutil.move(latest, target)
            print(f"Video saved to {target}")

if __name__ == "__main__":
    asyncio.run(main())
