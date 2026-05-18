"""Generate PDF from BrandBased-Operations-Runbook.md"""
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent
MD = ROOT / "BrandBased-Operations-Runbook.md"
OUT = ROOT / "BrandBased-Operations-Runbook.pdf"


class RunbookPDF(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


W = 186  # printable width (A4 minus margins)


def add_line(pdf: FPDF, line: str) -> None:
    line = line.replace("\t", "    ")
    # Helvetica is Latin-1; replace common Unicode from the MD file
    line = (
        line.replace("\u2192", "->")
        .replace("\u2014", "-")
        .replace("\u2013", "-")
        .replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
    )
    try:
        line.encode("latin-1")
    except UnicodeEncodeError:
        line = line.encode("latin-1", errors="replace").decode("latin-1")

    if line.startswith("# "):
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 14)
        pdf.multi_cell(W, 7, line[2:].strip())
        pdf.ln(2)
    elif line.startswith("## "):
        pdf.ln(3)
        pdf.set_font("Helvetica", "B", 12)
        pdf.multi_cell(W, 6, line[3:].strip())
        pdf.ln(1)
    elif line.startswith("### "):
        pdf.ln(2)
        pdf.set_font("Helvetica", "B", 11)
        pdf.multi_cell(W, 6, line[4:].strip())
    elif line.startswith("---"):
        pdf.ln(2)
        pdf.set_draw_color(180, 180, 180)
        pdf.line(10, pdf.get_y(), 200, pdf.get_y())
        pdf.ln(3)
    elif line.startswith("|"):
        stripped = line.replace("|", " ").replace("-", " ").strip()
        if not stripped:
            return
        pdf.set_font("Helvetica", "", 8)
        pdf.multi_cell(W, 4, stripped[:200])
    elif line.startswith("```"):
        pass
    elif line.strip() == "":
        pdf.ln(2)
    elif line.startswith("- ") or line.startswith("* "):
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(W, 5, "  " + line.strip())
    else:
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(W, 5, line)


def main() -> None:
    text = MD.read_text(encoding="utf-8")
    pdf = RunbookPDF()
    pdf.set_margins(12, 12, 12)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "", 9)

    in_code = False
    code_buf: list[str] = []
    for raw in text.splitlines():
        if raw.strip().startswith("```"):
            if in_code:
                pdf.set_font("Courier", "", 8)
                pdf.set_fill_color(245, 245, 245)
                block = "\n".join(code_buf)
                try:
                    block.encode("latin-1")
                except UnicodeEncodeError:
                    block = block.encode("latin-1", errors="replace").decode("latin-1")
                pdf.multi_cell(W, 4, block, fill=True)
                pdf.ln(2)
                code_buf = []
                in_code = False
            else:
                in_code = True
            continue
        if in_code:
            code_buf.append(raw)
            continue
        add_line(pdf, raw)

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
