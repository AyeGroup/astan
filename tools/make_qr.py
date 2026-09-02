#!/usr/bin/env python3
"""Bulk-generate one QR code per museum object.

Run this where you have network access and can `pip install qrcode[pil]`.
It is deliberately a local operator script rather than something the web
app does, so QR generation never depends on a CDN reachable from inside
the museum.

Input CSV columns: object_id, title[, avatar][, lang]

    python3 tools/make_qr.py objects.csv \
        --base https://museum.example.com/app/viewer.html \
        --bot 51585baf-c08c-4e4a-ab21-f1e704831154 \
        --out qr/
"""

import argparse
import csv
import os
import sys
from urllib.parse import urlencode


def build_url(base, bot, row):
    params = {"bot": bot, "obj": row["object_id"], "t": row.get("title", "")}
    if row.get("avatar"):
        params["av"] = row["avatar"]
    if row.get("lang"):
        params["lang"] = row["lang"]
    return f"{base}?{urlencode(params)}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_file")
    ap.add_argument("--base", required=True, help="deployed viewer.html URL")
    ap.add_argument("--bot", required=True, help="ragbuilder botUUID")
    ap.add_argument("--out", default="qr")
    ap.add_argument("--box-size", type=int, default=10)
    args = ap.parse_args()

    try:
        import qrcode
    except ImportError:
        sys.exit("qrcode is not installed. Run: pip install 'qrcode[pil]'")

    os.makedirs(args.out, exist_ok=True)
    manifest = []

    with open(args.csv_file, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            url = build_url(args.base, args.bot, row)
            # ERROR_CORRECT_Q survives a scuffed or partly covered label,
            # which matters for a sticker next to a display case.
            img = qrcode.QRCode(
                error_correction=qrcode.constants.ERROR_CORRECT_Q,
                box_size=args.box_size,
                border=3,
            )
            img.add_data(url)
            img.make(fit=True)
            path = os.path.join(args.out, f"{row['object_id']}.png")
            img.make_image(fill_color="black", back_color="white").save(path)
            manifest.append((row["object_id"], row.get("title", ""), url, path))
            print(f"wrote {path}")

    with open(os.path.join(args.out, "manifest.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["object_id", "title", "url", "file"])
        w.writerows(manifest)
    print(f"\n{len(manifest)} QR codes written to {args.out}/")


if __name__ == "__main__":
    main()
