---
name: md-pdf-convert
label: Markdown 转 PDF
description: Convert Markdown to PDF using ReportLab (handle CJK characters, tables, charts, images)
---

## Markdown → PDF Conversion (ReportLab)

> **IMPORTANT**: You have loaded this skill. You MUST now immediately execute ALL steps in the workflow below using `run_command` and `python_repl`. Do NOT summarize this skill or describe what you will do — just do it now.

Use case: Convert local Markdown documents to PDF (**currently only supports md → pdf**).

### Workflow (execute in order)

#### 1) Install Dependencies

- Install Python library: `reportlab`
- For stronger Markdown parsing, optionally install one of the following:
  - `markdown-it-py` / `mistune` / `markdown`

#### 2) Read and Parse the Markdown File

- Read the Markdown source file (UTF-8 recommended)
- Parse the structure and build a rendering model. At minimum, support:
  - Headings (H1 / H2 / H3)
  - Paragraphs, bold / italic, links
  - Ordered and unordered lists
  - Code blocks (monospace font + background color + indentation)

##### 2.1) Handling CJK Character Encoding (Required)

ReportLab's default fonts typically do not include CJK (Chinese/Japanese/Korean) characters. Rendering CJK text without a proper font will produce garbled output or empty boxes.

Requirements:

- Before generating the PDF, you **must** register and use a font that covers CJK characters (TTF / OTF / TTC).
- Recommended fonts by platform:
  - macOS: `PingFang SC` / `Heiti SC`
  - Windows: `Microsoft YaHei` / `SimSun`
  - Linux: `Noto Sans CJK`
- If the runtime environment cannot guarantee the presence of a system font, ask the user to provide the absolute path to a font file.
- Common font registration entry points:
  - `reportlab.pdfbase.ttfonts.TTFont`
  - `reportlab.pdfbase.pdfmetrics.registerFont(...)`

##### 2.2) Rendering Tables, Bar Charts, Pie Charts, and Images

During the parsing stage, identify and generate corresponding render nodes for each of the following (to be rendered later by ReportLab):

---

**Tables — Critical: must be parsed and rendered as `platypus.Table`, never as plain text**

Markdown table syntax uses `|` as column delimiter and a separator row of `---` dashes as the second row. You **must** detect this pattern and convert it to a ReportLab `Table` object. Rendering it as a `Paragraph` or plain string is wrong.

Parsing logic (mandatory):

```python
import re
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors

def parse_md_table(lines):
    """
    Detect a Markdown table block from a list of lines.
    Returns a list of rows (each row is a list of cell strings),
    or None if the block is not a valid table.
    """
    # A valid table must have at least 3 lines: header | separator | data row(s)
    if len(lines) < 3:
        return None
    # The separator line must match: | --- | :---: | ---: | etc.
    sep_pattern = re.compile(r'^\|?[\s\-:]+(\|[\s\-:]+)+\|?$')
    if not sep_pattern.match(lines[1].strip()):
        return None

    rows = []
    for i, line in enumerate(lines):
        if i == 1:          # skip separator row
            continue
        # Strip leading/trailing pipe characters, then split on '|'
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        rows.append(cells)
    return rows  # rows[0] = header row, rows[1:] = data rows


def build_rl_table(rows, col_width=None, font_name='Helvetica', page_width=450):
    """
    Convert parsed row data into a styled ReportLab Table.

    CRITICAL: cell contents must be wrapped in Paragraph objects to enable
    automatic line-wrapping. Passing plain strings will cause long content
    to overflow the cell boundary instead of wrapping.
    """
    if not rows:
        return None

    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT

    num_cols = max(len(r) for r in rows)
    if col_width is None:
        col_width = page_width / num_cols
    col_widths = [col_width] * num_cols

    # Build cell styles — Paragraph objects are what actually enable wrapping
    header_style = ParagraphStyle(
        'TableHeader',
        fontName=font_name,
        fontSize=11,
        textColor=colors.white,
        leading=14,
        alignment=TA_LEFT,
    )
    cell_style = ParagraphStyle(
        'TableCell',
        fontName=font_name,
        fontSize=10,
        textColor=colors.black,
        leading=13,
        alignment=TA_LEFT,
        wordWrap='CJK',   # handles both CJK and Latin word boundaries
    )

    data = []
    for row_idx, row in enumerate(rows):
        # Pad short rows
        padded = row + [''] * (num_cols - len(row))
        style = header_style if row_idx == 0 else cell_style
        # ⚠ Wrap every cell in Paragraph — this is what enables auto line-wrap
        data.append([Paragraph(str(cell), style) for cell in padded])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        # Header row background
        ('BACKGROUND',    (0, 0), (-1, 0),  colors.HexColor('#4A90D9')),
        # Alternating row backgrounds
        ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        # Padding
        ('TOPPADDING',    (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING',   (0, 0), (-1, -1), 8),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 8),
        # Borders
        ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#CCCCCC')),
        ('BOX',           (0, 0), (-1, -1), 1,   colors.HexColor('#999999')),
        # Vertical alignment
        ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
    ]))
    return table
```

Integration — detecting table blocks while walking the Markdown line-by-line:

```python
def parse_blocks(md_text):
    """
    Walk through Markdown lines and emit render nodes.
    Table blocks are emitted as ('table', rows); other lines as ('para', text).
    """
    lines  = md_text.splitlines()
    blocks = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Detect table start: a line that contains '|' and is not inside a code fence
        if '|' in line and not line.startswith('```'):
            # Collect all consecutive lines that belong to this table
            table_lines = []
            while i < len(lines) and '|' in lines[i]:
                table_lines.append(lines[i])
                i += 1
            rows = parse_md_table(table_lines)
            if rows:
                blocks.append(('table', rows))
            else:
                # Fallback: treat as plain paragraphs
                for l in table_lines:
                    blocks.append(('para', l))
        else:
            blocks.append(('para', line))
            i += 1
    return blocks
```

**⚠ Common mistakes that cause tables to render as plain text or overflow:**
1. Forgetting to detect the `|` separator and passing the raw line to `Paragraph()` instead.
2. Splitting on `|` but then joining back into a string and wrapping it in `Paragraph()`.
3. Checking for the separator row (`---`) but then skipping the whole block instead of parsing it.
4. **Passing plain strings as cell data instead of `Paragraph` objects** — `TableStyle WORDWRAP` alone does NOT wrap text; each cell must be a `Paragraph` instance for automatic line-wrapping to work. Always wrap every cell: `Paragraph(str(cell), style)`.

---

- **Bar charts / Pie charts:**
  - Data source can be constrained to:
    - Structured blocks within the Markdown (e.g., fenced code blocks containing JSON/CSV), or
    - Convention-based lists or sections
  - Use `reportlab.graphics` to generate vector graphics (`Drawing` + `VerticalBarChart` / `Pie`) for sharp rendering

- **Images:**
  - Parse `![]()` syntax and read local image file paths (absolute paths recommended)
  - Use `reportlab.platypus.Image`, scale proportionally to page width, and center horizontally

#### 3) Generate the Conversion Script

Combine parsing and rendering into a single executable script (e.g., `convert_md_to_pdf.py`). The script is responsible for:
- Reading the Markdown → parsing into nodes → rendering to PDF using ReportLab

#### 4) Run the Conversion Script

- Execute the script to produce the PDF
- If layout overflow occurs (oversized tables, large images, long code blocks): adjust scaling, line-wrapping, or page-break strategies and retry

### Layout Requirements (Clean and Readable)

- Paper size: A4; recommended margins: 24–36 pt
- Body font size: 12–14 pt; line spacing: 1.2–1.5×
- Headings: tiered font sizes with space-before / space-after (do not crowd the body text)
- Lists: consistent indentation with clear hierarchy
- Code blocks: monospace font, light gray background, left/right padding, auto line-wrapping or horizontal scaling
- Tables: header background color, cell padding, auto line-wrapping; prefer scaling or column splitting for overly wide tables

### Constraints

- PDF → Markdown conversion is **not** currently supported.
- Only Markdown input is accepted; PDF input is **not** supported.
