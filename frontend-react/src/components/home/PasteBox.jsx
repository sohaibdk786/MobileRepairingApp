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
    <Box title="Paste & Print" subtitle="Paste, format, print -- nothing saved">
      <form
        className="flex flex-col flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          onPrint();
        }}
      >
        <Field label="Paste text here">
          <FormTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste voucher text..."
          />
        </Field>
        <PrimaryButton type="button" disabled={printing} onClick={onPrint}>
          Print
        </PrimaryButton>
      </form>
      <StatusMessage confirmation={confirmation} error={error} />
    </Box>
  );
});

export default PasteBox;
