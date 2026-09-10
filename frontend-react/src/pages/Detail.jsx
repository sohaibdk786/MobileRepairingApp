import { useNavigate, useSearchParams } from "react-router-dom";
import PhoneDetail from "../components/detail/PhoneDetail";
import RepairDetail from "../components/detail/RepairDetail";
import SaleDetail from "../components/detail/SaleDetail";
import { Btn } from "../components/detail/DetailUi";

export default function Detail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const type = params.get("type");
  const ticket = params.get("ticket");
  const saleId = params.get("id") || params.get("sale");
  const phoneId = type === "phone" ? params.get("id") : null;

  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else if (type === "phone") navigate("/tools/phones");
    else navigate("/search");
  }

  return (
    <div>
      <Btn variant="secondary" size="sm" className="mb-1" onClick={goBack}>
        ← Back
      </Btn>

      {type === "phone" && phoneId ? (
        <PhoneDetail phoneId={phoneId} />
      ) : type === "repair" && ticket ? (
        <RepairDetail ticket={ticket} />
      ) : type === "sale" && saleId ? (
        <SaleDetail saleId={saleId} />
      ) : ticket && !type ? (
        <RepairDetail ticket={ticket} />
      ) : saleId && !type ? (
        <SaleDetail saleId={saleId} />
      ) : (
        <div className="mt-4 rounded-[10px] px-3 py-2.5 text-sm font-medium bg-error-bg text-error-text">
          No ticket or sale specified.
        </div>
      )}
    </div>
  );
}
