#!/usr/bin/env python3
"""Tell IndexNow search engines (Bing, Yandex, Seznam, Naver...) which public pages changed.

Usage: python3 scripts/indexnow.py <git-range>      e.g. HEAD~1..HEAD   (changed pages only)
       python3 scripts/indexnow.py --all            (every URL in public/sitemap.xml)
Run by .github/workflows/indexnow.yml after a push to main. Only URLs that are in the sitemap are sent,
so private pages (admin, host, booking steps) are never submitted.
"""
import json, os, re, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "bookhomes.co.uk"
KEY = "00d622ef355b6708bc52633c7be81118"


def sitemap_urls():
    sm = open(os.path.join(ROOT, "public", "sitemap.xml"), encoding="utf-8").read()
    return re.findall(r"<loc>([^<]+)</loc>", sm)


def changed_urls(rng):
    out = subprocess.run(["git", "diff", "--name-only", rng, "--", "public/"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    urls = set()
    for f in out.split():
        if not f.endswith(".html"):
            continue
        path = f[len("public"):].replace("/index.html", "").replace(".html", "") or "/"
        urls.add(f"https://{HOST}{path}")
    return urls


def main():
    allowed = sitemap_urls()
    if sys.argv[1:] == ["--all"]:
        urls = allowed
    else:
        ch = changed_urls(sys.argv[1] if len(sys.argv) > 1 else "HEAD~1..HEAD")
        urls = [u for u in allowed if u in ch]
    if not urls:
        print("IndexNow: no public page changed")
        return
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls[:10000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(f"IndexNow: sent {len(urls)} URLs, HTTP {r.status}")
    except urllib.error.HTTPError as e:
        print(f"IndexNow: HTTP {e.code} {e.read()[:200]!r}")
        sys.exit(1 if e.code not in (202, 429) else 0)


if __name__ == "__main__":
    main()
