---
name: doc-to-pptx
description: Convert Word/PDF documents to PPTX presentations.
---

## Document to PPTX

### Read Document

- `.docx` → `read_docx` → text, tables, images
- `.pdf` → `read_pdf` → text, images, page_images (rendered pages)

### Insert Images

```python
from pptx.util import Inches
from PIL import Image

def add_image(slide, img_path, max_w=10, max_h=5.5, left=0.5, top=1.5):
    with Image.open(img_path) as img:
        w, h = img.size
    scale = min(max_w * 96 / w, max_h * 96 / h, 1)
    slide.shapes.add_picture(img_path, Inches(left), Inches(top),
                             width=Inches(w * scale / 96))
```

For PDF formulas/charts: insert `page_images` directly as slides.

### Insert Tables

```python
def add_table(slide, table_data, left=0.5, top=1.5, width=12):
    rows = table_data.rows
    shape = slide.shapes.add_table(len(rows), len(rows[0]),
                                   Inches(left), Inches(top),
                                   Inches(width), Inches(len(rows) * 0.5))
    for i, row in enumerate(rows):
        for j, text in enumerate(row):
            shape.table.cell(i, j).text = text
```

### Layout

- Large image/table → dedicated slide
- Multiple small images → grid layout
- PDF with formulas → use page_images as full slides
