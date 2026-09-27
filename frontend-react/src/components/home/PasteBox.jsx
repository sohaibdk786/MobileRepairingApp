import { forwardRef, useImperativeHandle, useState } from "react";
import { api } from "../../api";
import { deliverReceipt } from "../../lib/printing";
import { Box, Field, FormTextarea, PrimaryButton, StatusMessage } from "./FormBits";

const PasteBox = forwardRef(function PasteBox(_props, ref) {
  const [text, setText] = useState("");
  const [printing, setPrinting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  useImperativeHandle(ref, () => ({
    reset() {
      setText("");
      setConfirmation("");
      setError("");
    },
  }));

  async function onPrint() {
    if (printing) return;
    if (!text.trim()) {
      setError("Paste some text first");
      setConfirmation("");
      return;
    }
    setPrinting(true);
    setError("");
    setConfirmation("");
    try {
      const payload = await api.post("/api/paste-print", { text });
      await deliverReceipt(payload);
      setConfirmation("Printed.");
    } catch (err) {
      setError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    // Same min-h as Repair/Sale (see RepairBox.jsx's comment) -- all three
    // share this explicitly rather than being matched via stretch, so the
    // row looks even at rest without this box growing every time a
    // sibling does.
    <Box
      title="Paste & Print"
      subtitle="Paste, format, print -- nothing saved"
      className="min-h-[32rem]"
    >
      <form
        className="flex flex-col flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          onPrint();
        }}
      >
        <Field label="Paste text here">
          <FormTextarea
            rows={12}
            className="min-h-[16rem] resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste voucher text..."
          />
        </Field>
        <PrimaryButton type="button" disabled={printing} onClick={onPrint}>
          Print
        </PrimaryButton>
      </form>
      <StatusMessage confirmation={confirmation} error={error} floating />
    </Box>
  );
});

export default PasteBox;
