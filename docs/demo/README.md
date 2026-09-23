# OpenLC demo upload files

Use the files in this folder for a live BOT Chain demo order. The files keep their original
names (`PP-` / `DO-FS-` prefixes) — only the story below and `COPY-PASTE-TEXT.txt` are OpenLC's.

Buyer company: **Choong Trading Sdn. Bhd.**
Supplier company: **FreshSource Foods Sdn. Bhd.**

| Demo step | File to upload |
|---|---|
| Create order, **Import from file** | `PP-DEMO-0905-purchase-order.pdf` |
| Create order, attach signed agreement | `PP-DEMO-0905-agreement.pdf` |
| Supplier marks order as shipped | `supplier-dispatch.png` |
| Buyer records arrival | `DO-FS-0905.pdf` |
| Buyer opens the damage claim | `receiving-damage.png` |
| Supplier disputes with evidence | `supplier-dispatch.png` |

All files and images contain synthetic demonstration data.

Use `COPY-PASTE-TEXT.txt` for the shipping details, inspection statement, and supplier response.
The TXT version of the purchase order is also included as a fallback if PDF extraction is
unavailable.

Before creating the order, either tick **"Use the OpenLC demo supplier"** for a one-wallet run, or
open the confirmation link in a second MetaMask account and accept it as the supplier. Review all
fields extracted from the purchase order before submitting.
