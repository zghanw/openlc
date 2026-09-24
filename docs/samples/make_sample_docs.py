"""Regenerate the OpenLC sample documents (purchase order, agreement, delivery order).

These are the files someone trying OpenLC can upload while running an order. They must
stay text-based PDFs (real text, not images) so the create-order dialog's "Import from
file" AI reader can extract fields from the purchase order.

Run: python docs/samples/make_sample_docs.py
Regenerates, in this folder:
  OLC-DEMO-0905-purchase-order.pdf
  OLC-DEMO-0905-purchase-order.txt
  OLC-DEMO-0905-agreement.pdf
  DO-FS-0905.pdf   (the supplier's own delivery order; keeps its own document number)
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

DEMO_DIR = Path(__file__).resolve().parent

# --- The one story, told once. Every document below pulls from these constants. ---
REFERENCE = "OLC-DEMO-0905"
ISSUE_DATE = "24 September 2026"
EXPECTED_DELIVERY = "1 October 2026"
BUYER = "Choong Trading Sdn. Bhd."
SUPPLIER = "FreshSource Foods Sdn. Bhd."
DELIVERY_LOCATION = "Receiving Bay 2, Shah Alam Distribution Centre"
CURRENCY = "BOT"
CARRIER = "DHL Express"
TRACKING_NUMBER = "DHL-OLC-0905-MY"
DELIVERY_ORDER_NUMBER = "DO-FS-0905"
TAGLINE = "Escrow-secured order · OpenLC on BOT Chain"
SUPPLIER_PAYOUT_NOTE = "Supplier payout: the wallet that accepts this order on OpenLC"

# description, quantity, unit, unit price (BOT)
LINE_ITEMS = [
    ("Fresh strawberries, 8 x 250 g punnets", 10, "cartons", 0.12),
    ("Fresh blueberries, 12 x 125 g punnets", 6, "cartons", 0.15),
    ("Premium Hass avocados, 4 kg", 6, "crates", 0.15),
]
ORDER_TOTAL = sum(qty * price for _, qty, _, price in LINE_ITEMS)

DAMAGED_CARTONS = 3
DAMAGED_UNIT_PRICE = LINE_ITEMS[0][3]
EXCEPTION_VALUE = DAMAGED_CARTONS * DAMAGED_UNIT_PRICE

BLACK = colors.black
GREY = colors.HexColor("#6b6b6b")
RULE_GREY = colors.HexColor("#bbbbbb")

MARGIN = 20 * mm
PAGE_WIDTH = A4[0] - 2 * MARGIN


def money(amount):
    return f"{amount:.2f} {CURRENCY}"


def styles():
    return {
        "brand": ParagraphStyle("brand", fontName="Helvetica-Bold", fontSize=18, textColor=BLACK, leading=20),
        "tagline": ParagraphStyle("tagline", fontName="Helvetica-Oblique", fontSize=9, textColor=GREY, leading=12),
        "doctype": ParagraphStyle("doctype", fontName="Helvetica-Bold", fontSize=11, textColor=GREY, alignment=TA_RIGHT, leading=13),
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=14, textColor=BLACK, alignment=TA_RIGHT, leading=17, spaceBefore=2),
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=7.5, textColor=GREY, leading=10),
        "value": ParagraphStyle("value", fontName="Helvetica", fontSize=10.5, textColor=BLACK, leading=13),
        "value_r": ParagraphStyle("value_r", fontName="Helvetica", fontSize=10.5, textColor=BLACK, leading=13, alignment=TA_RIGHT),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=13),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=12),
        "cell_r": ParagraphStyle("cell_r", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=12, alignment=TA_RIGHT),
        "cell_head": ParagraphStyle("cell_head", fontName="Helvetica-Bold", fontSize=8, textColor=GREY, leading=10),
        "cell_head_r": ParagraphStyle("cell_head_r", fontName="Helvetica-Bold", fontSize=8, textColor=GREY, leading=10, alignment=TA_RIGHT),
        "total_r": ParagraphStyle("total_r", fontName="Helvetica-Bold", fontSize=10.5, textColor=BLACK, leading=13, alignment=TA_RIGHT),
        "footer": ParagraphStyle("footer", fontName="Helvetica-Oblique", fontSize=7.5, textColor=GREY, leading=10),
    }


def header(s, brand, tagline, doctype, title):
    """Two-column masthead: brand + tagline on the left, doc type + title on the right."""
    t = Table(
        [[
            [Paragraph(brand, s["brand"]), Paragraph(tagline, s["tagline"])],
            [Paragraph(doctype, s["doctype"]), Paragraph(title, s["title"])],
        ]],
        colWidths=[PAGE_WIDTH * 0.55, PAGE_WIDTH * 0.45],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def rule():
    t = Table([[""]], colWidths=[PAGE_WIDTH], rowHeights=[1])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1, RULE_GREY)]))
    return t


def field_grid(s, pairs):
    """A row of label/value pairs, e.g. [("REFERENCE", "OLC-DEMO-0905"), ...]."""
    n = len(pairs)
    row = []
    for label, value in pairs:
        row.append([Paragraph(label, s["label"]), Paragraph(value, s["value"])])
    t = Table([row], colWidths=[PAGE_WIDTH / n] * n)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def parties_block(s, left_label, left_lines, right_label, right_lines):
    left = [Paragraph(left_label, s["label"])] + [Paragraph(l, s["value"]) for l in left_lines]
    right = [Paragraph(right_label, s["label"])] + [Paragraph(l, s["value"]) for l in right_lines]
    t = Table([[left, right]], colWidths=[PAGE_WIDTH * 0.5, PAGE_WIDTH * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def line_items_table(s, qty_header, total_label):
    header_row = [
        Paragraph("Description", s["cell_head"]),
        Paragraph(qty_header, s["cell_head_r"]),
        Paragraph("Unit", s["cell_head_r"]),
        Paragraph("Unit price", s["cell_head_r"]),
        Paragraph("Line total", s["cell_head_r"]),
    ]
    rows = [header_row]
    for desc, qty, unit, price in LINE_ITEMS:
        rows.append([
            Paragraph(desc, s["cell"]),
            Paragraph(str(qty), s["cell_r"]),
            Paragraph(unit, s["cell_r"]),
            Paragraph(money(price), s["cell_r"]),
            Paragraph(money(qty * price), s["cell_r"]),
        ])
    rows.append([
        Paragraph(total_label, s["total_r"]),
        "", "", "",
        Paragraph(money(ORDER_TOTAL), s["total_r"]),
    ])
    col_widths = [PAGE_WIDTH * 0.40, PAGE_WIDTH * 0.14, PAGE_WIDTH * 0.14, PAGE_WIDTH * 0.16, PAGE_WIDTH * 0.16]
    t = Table(rows, colWidths=col_widths)
    last = len(rows) - 1
    t.setStyle(TableStyle([
        ("SPAN", (0, last), (3, last)),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, RULE_GREY),
        ("LINEABOVE", (0, last), (-1, last), 0.75, RULE_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def signature_block(s, left_role, left_name, left_company, right_role, right_name, right_company):
    blank = Table([[""]], colWidths=[PAGE_WIDTH * 0.42], rowHeights=[16 * mm])
    blank.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.75, RULE_GREY)]))
    blank2 = Table([[""]], colWidths=[PAGE_WIDTH * 0.42], rowHeights=[16 * mm])
    blank2.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.75, RULE_GREY)]))

    left = [
        Paragraph(left_role, s["label"]),
        blank,
        Paragraph(left_name, s["value"]),
        Paragraph(left_company, s["value"]),
    ]
    right = [
        Paragraph(right_role, s["label"]),
        blank2,
        Paragraph(right_name, s["value"]),
        Paragraph(right_company, s["value"]),
    ]
    t = Table([[left, right]], colWidths=[PAGE_WIDTH * 0.5, PAGE_WIDTH * 0.5])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def build_doc(path, story):
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=18 * mm, bottomMargin=18 * mm,
        title=path.stem,
    )
    doc.build(story)


def build_purchase_order_pdf(s):
    story = [
        header(s, "OpenLC", TAGLINE, REFERENCE, "Purchase Order"),
        Spacer(1, 10 * mm),
        field_grid(s, [
            ("REFERENCE", REFERENCE),
            ("EXPECTED DELIVERY", EXPECTED_DELIVERY),
        ]),
        Spacer(1, 4 * mm),
        field_grid(s, [
            ("ISSUE DATE", ISSUE_DATE),
            ("SETTLEMENT CURRENCY", CURRENCY),
        ]),
        Spacer(1, 6 * mm),
        rule(),
        Spacer(1, 6 * mm),
        parties_block(
            s, "BUYER", [BUYER],
            "DELIVERY LOCATION", [DELIVERY_LOCATION],
        ),
        Spacer(1, 6 * mm),
        parties_block(
            s, "SUPPLIER", [SUPPLIER],
            "SUPPLIER PAYOUT", ["The wallet that accepts this order on OpenLC"],
        ),
        Spacer(1, 8 * mm),
        line_items_table(s, "Quantity", "Order total"),
        Spacer(1, 8 * mm),
        Paragraph("RECEIVING TERMS", s["label"]),
        Spacer(1, 2 * mm),
        Paragraph(
            "Goods will be checked at Receiving Bay 2. Visible exceptions will be photographed "
            "at handover. Undisputed goods may be accepted and released separately from damaged goods.",
            s["body"],
        ),
        Spacer(1, 10 * mm),
        Paragraph(
            "Demonstration document: this purchase order contains synthetic data prepared for "
            "an OpenLC product demonstration.",
            s["footer"],
        ),
    ]
    build_doc(DEMO_DIR / f"{REFERENCE}-purchase-order.pdf", story)


def build_agreement_pdf(s):
    clauses = [
        "The supplier will photograph the pallet immediately before carrier collection.",
        "The buyer will inspect the shipment and record visible exceptions at handover.",
        "Damaged quantities will be valued using the purchase-order unit price.",
        "The undisputed portion may be released while a claim is reviewed.",
        "If the parties disagree, both parties may submit evidence for AI-assisted mediation.",
        "Any proposed settlement requires approval from both buyer and supplier.",
    ]
    story = [
        header(s, "OpenLC", TAGLINE, "AGREEMENT", "Cold-Chain Delivery Agreement"),
        Spacer(1, 4 * mm),
        Paragraph(f"Reference: {REFERENCE} | Effective date: {ISSUE_DATE}", s["body"]),
        Spacer(1, 6 * mm),
        rule(),
        Spacer(1, 6 * mm),
        parties_block(s, "BUYER", [BUYER], "SUPPLIER", [SUPPLIER]),
        Spacer(1, 8 * mm),
    ]
    for i, clause in enumerate(clauses, start=1):
        story.append(Paragraph(f"{i}. {clause}", s["body"]))
        story.append(Spacer(1, 3 * mm))
    story += [
        Spacer(1, 10 * mm),
        signature_block(
            s,
            "AUTHORISED FOR THE BUYER", "CHOONG ZHUO LIN", BUYER,
            "AUTHORISED FOR THE SUPPLIER", "Demo supplier representative", SUPPLIER,
        ),
        Spacer(1, 10 * mm),
        Paragraph(
            "Demonstration document: this agreement contains synthetic data prepared for an "
            "OpenLC product demonstration.",
            s["footer"],
        ),
    ]
    build_doc(DEMO_DIR / f"{REFERENCE}-agreement.pdf", story)


def build_delivery_order_pdf(s):
    story = [
        header(s, "FreshSource Foods", "Cold-chain distribution", "DELIVERY RECORD", "Delivery Note"),
        Spacer(1, 10 * mm),
        field_grid(s, [
            ("DELIVERY ORDER", DELIVERY_ORDER_NUMBER),
            ("BUYER", BUYER),
        ]),
        Spacer(1, 4 * mm),
        field_grid(s, [
            ("TRACKING NUMBER", TRACKING_NUMBER),
            ("DELIVERY LOCATION", DELIVERY_LOCATION),
        ]),
        Spacer(1, 4 * mm),
        field_grid(s, [
            ("PURCHASE ORDER", REFERENCE),
            ("CARRIER", CARRIER),
        ]),
        Spacer(1, 4 * mm),
        field_grid(s, [
            ("DELIVERY DATE", EXPECTED_DELIVERY),
            ("SETTLEMENT CURRENCY", CURRENCY),
        ]),
        Spacer(1, 6 * mm),
        rule(),
        Spacer(1, 6 * mm),
        Paragraph("DELIVERED GOODS AND DECLARED VALUE", s["label"]),
        Spacer(1, 2 * mm),
        line_items_table(s, "Qty", "Total declared value"),
        Spacer(1, 8 * mm),
        Paragraph("RECEIVING EXCEPTION", s["label"]),
        Spacer(1, 2 * mm),
        Paragraph(
            "Three strawberry cartons were observed with crushed corners and moisture damage. "
            "The blueberries and avocados were received in apparently sound condition. "
            f"Exception value: {DAMAGED_CARTONS} cartons × {money(DAMAGED_UNIT_PRICE)} = {money(EXCEPTION_VALUE)}.",
            s["body"],
        ),
        Spacer(1, 10 * mm),
        Paragraph("RECEIVED FOR", s["label"]),
        Paragraph(BUYER, s["value"]),
        Paragraph("Demo receiving representative", s["value"]),
        Spacer(1, 10 * mm),
        Paragraph(
            "This delivery note contains synthetic data prepared for an OpenLC product demonstration.",
            s["footer"],
        ),
    ]
    build_doc(DEMO_DIR / f"{DELIVERY_ORDER_NUMBER}.pdf", story)


def build_purchase_order_txt():
    lines = [
        "PURCHASE ORDER",
        "",
        f"Reference: {REFERENCE}",
        f"Issue date: {ISSUE_DATE}",
        f"Expected delivery: {EXPECTED_DELIVERY}",
        "",
        "Buyer:",
        BUYER,
        "",
        "Supplier:",
        SUPPLIER,
        f"{SUPPLIER_PAYOUT_NOTE}.",
        "",
        "Delivery location:",
        DELIVERY_LOCATION,
        "",
        "LINE ITEMS",
        "",
    ]
    for i, (desc, qty, unit, price) in enumerate(LINE_ITEMS, start=1):
        lines += [
            f"{i}. {desc}",
            f"   Quantity: {qty} {unit}",
            f"   Unit price: {money(price)}",
            f"   Line total: {money(qty * price)}",
            "",
        ]
    lines += [
        f"TOTAL ORDER VALUE: {money(ORDER_TOTAL)}",
        "",
        "Receiving terms:",
        "Goods will be checked at Receiving Bay 2.",
        "Visible exceptions will be photographed at handover.",
        "Undisputed goods may be accepted and released separately from damaged goods.",
        "",
        "This purchase order contains synthetic data prepared for an OpenLC product demonstration.",
    ]
    (DEMO_DIR / f"{REFERENCE}-purchase-order.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    s = styles()
    build_purchase_order_pdf(s)
    build_agreement_pdf(s)
    build_delivery_order_pdf(s)
    build_purchase_order_txt()
    print("Generated:")
    for name in (
        f"{REFERENCE}-purchase-order.pdf",
        f"{REFERENCE}-purchase-order.txt",
        f"{REFERENCE}-agreement.pdf",
        f"{DELIVERY_ORDER_NUMBER}.pdf",
    ):
        print(" ", DEMO_DIR / name)


if __name__ == "__main__":
    main()
