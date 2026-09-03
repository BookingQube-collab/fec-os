import zipfile
import re
from pathlib import Path

pptx = Path(r"A:\E3_PR_System_Practical_User_Manual.pptx")
out = Path(r"A:\Live Projects\FEC\docs\pr-manual-slides\mapped")
out.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(pptx, "r") as z:
    for i in range(1, 36):
        slide_path = f"ppt/slides/slide{i}.xml"
        if slide_path not in z.namelist():
            continue
        texts = re.findall(r"<a:t[^>]*>([^<]*)</a:t>", z.read(slide_path).decode("utf-8", "replace"))
        title = next((t for t in texts if t.strip() and len(t) > 3), f"slide{i}")
        imgs = []
        rel_path = f"ppt/slides/_rels/slide{i}.xml.rels"
        if rel_path in z.namelist():
            rels = z.read(rel_path).decode("utf-8", "replace")
            for m in re.finditer(r'Target="\.\./media/([^"]+)"', rels):
                imgs.append(m.group(1))
        print(f"Slide {i:02d}: {title[:50]!r} -> {imgs}")
        for img in imgs:
            src = f"ppt/media/{img}"
            if src in z.namelist():
                safe = re.sub(r"[^\w\-]", "-", title[:24])
                dest = out / f"slide{i:02d}-{safe}{Path(img).suffix or '.jpeg'}"
                dest.write_bytes(z.read(src))
