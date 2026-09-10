"""Receipt rendering and delivery (PDF in Test mode, ESC/POS in Live)."""
from backend.printing.delivery import deliver_receipt

__all__ = ["deliver_receipt"]
