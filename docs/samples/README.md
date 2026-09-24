# Sample order documents

Files for trying a full OpenLC order: a purchase order, an agreement, a delivery order and two
photos. Every file contains synthetic data. Regenerate the PDFs with `make_sample_docs.py`.

Buyer company: **Choong Trading Sdn. Bhd.**
Supplier company: **FreshSource Foods Sdn. Bhd.**

| Step | File to upload |
|---|---|
| Create the order, **Import from file** | `OLC-DEMO-0905-purchase-order.pdf` |
| Create the order, attach the signed agreement | `OLC-DEMO-0905-agreement.pdf` |
| Supplier marks the order as shipped | `supplier-dispatch.png` |
| Buyer records the delivery | `DO-FS-0905.pdf` |
| Buyer opens a claim for damaged goods | `receiving-damage.png` |
| Supplier responds with evidence | `supplier-dispatch.png` |

`COPY-PASTE-TEXT.txt` has the shipping details, the inspection statement and the supplier's
response. `OLC-DEMO-0905-purchase-order.txt` is a text copy of the purchase order, in case
reading the PDF is unavailable.

The purchase order totals 3 BOT. On mainnet, lower the unit prices before funding if you only
want to try the flow: every amount is real BOT.

The buyer and the supplier each sign in with their own MetaMask wallet. The supplier confirms by
opening the confirmation link the buyer copies after creating the order. Review every field read
from the purchase order before sending it.
