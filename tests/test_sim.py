import asyncio
from playwright.async_api import async_playwright
import time

async def main():
    print("Starting automated browser test...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        # Listen for console logs to check for errors
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: errors.append(str(err)))

        print("Navigating to simulation...")
        await page.goto("http://localhost:8080/flood_fill.html", wait_until="networkidle")
        
        # Take initial screenshot of loading state
        await page.screenshot(path="test_loading.png")
        print("Waiting for JS flood fill engine to initialize...")
        
        try:
            # Wait for controls to become visible (meaning images loaded and initial BFS finished)
            await page.wait_for_selector("#controls", state="visible", timeout=10000)
            print("Engine initialized successfully.")
        except Exception as e:
            print("Failed to initialize engine within timeout:", str(e))
            await page.screenshot(path="test_error.png")
            if errors:
                print("Browser errors found:", errors)
            await browser.close()
            return
            
        # Take screenshot of loaded state at 0m
        await page.screenshot(path="test_0m.png")
        
        print("Testing physics: Changing sea level to 100m...")
        # Move slider and dispatch input event to trigger the flood fill
        await page.evaluate("""
            const slider = document.getElementById('seaLevel');
            slider.value = 100;
            slider.dispatchEvent(new Event('input'));
        """)
        
        # Wait a moment for WebGL to render the new frame
        time.sleep(1) 
        
        # Capture final screenshot at 100m
        await page.screenshot(path="test_100m.png")
        print("Test completed. Screenshots saved.")
        
        if errors:
            print("There were browser console errors during the test:")
            for err in errors:
                print(f" - {err}")
        else:
            print("No console errors detected! WebGL rendering was successful.")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
