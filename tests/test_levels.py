import asyncio
from playwright.async_api import async_playwright
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        await page.goto("http://localhost:8080/flood_fill.html", wait_until="networkidle")
        await page.wait_for_selector("#controls", state="visible", timeout=10000)
        
        # 0m
        await page.screenshot(path="level_0.png")
        
        # 500m
        await page.evaluate("document.getElementById('seaLevel').value = 500; document.getElementById('seaLevel').dispatchEvent(new Event('input'));")
        time.sleep(1)
        await page.screenshot(path="level_500.png")
        
        # 1000m
        await page.evaluate("document.getElementById('seaLevel').value = 1000; document.getElementById('seaLevel').dispatchEvent(new Event('input'));")
        time.sleep(1)
        await page.screenshot(path="level_1000.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
