import requests
from bs4 import BeautifulSoup
import urllib.parse

def free_web_search(query: str):
    """
    Scrapes DuckDuckGo HTML search for the top 5-6 results to use as free context for RAG.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    results = []
    try:
        response = requests.get(url, headers=headers, timeout=6)
        if response.ok:
            soup = BeautifulSoup(response.text, "html.parser")
            search_results = soup.find_all("div", class_="result")
            for res in search_results[:6]:
                title_el = res.find("a", class_="result__url")
                snippet_el = res.find("a", class_="result__snippet")
                if title_el:
                    title = title_el.get_text(strip=True)
                    link = title_el.get("href", "")
                    if "uddg=" in link:
                        # Parse out redirection
                        parsed = urllib.parse.urlparse(link)
                        queries = urllib.parse.parse_qs(parsed.query)
                        if "uddg" in queries:
                            link = queries["uddg"][0]
                    snippet = snippet_el.get_text(strip=True) if snippet_el else ""
                    results.append({
                        "title": title,
                        "link": link,
                        "snippet": snippet
                    })
    except Exception as exc:
        print(f"[web_search] DDG scrape failed: {exc}")
    return results
