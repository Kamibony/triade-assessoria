from playwright.sync_api import sync_playwright

def verify():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Navigating to /portal...")
            page.goto("http://localhost:5173/portal")
            page.wait_for_load_state("networkidle")

            print("Taking screenshot...")
            page.screenshot(path="verification.png")
            print("Screenshot saved to verification.png")

        except Exception as e:
             print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify()
