import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ModalContext = createContext(null);

/**
 * Port of frontend/common.js showModal — closes as soon as a button is
 * clicked, then runs onClick (may be async).
 */
export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const showModal = useCallback(({ title, message, buttons }) => {
    setModal({ title, message, buttons: buttons || [] });
  }, []);

  const value = useMemo(() => ({ showModal }), [showModal]);

  function closeAndRun(onClick) {
    setModal(null);
    if (onClick) void onClick();
  }

  return (
    <ModalContext.Provider value={value}>
      {children}
      {modal
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="bg-card text-text rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] max-w-md w-full p-5 border border-border">
                <h3 className="text-lg font-semibold mt-0 mb-2">{modal.title}</h3>
                {modal.message ? (
                  <p className="text-sm text-muted mb-4 whitespace-pre-wrap">{modal.message}</p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {modal.buttons.map((btn, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => closeAndRun(btn.onClick)}
                      className={`w-full rounded-[10px] px-3 py-2.5 text-sm font-semibold border-0 cursor-pointer ${
                        btn.className === "danger"
                          ? "bg-error text-white hover:bg-error-dark"
                          : btn.className === "secondary" || !btn.className
                            ? "bg-bg text-text border border-border-strong hover:bg-secondary-hover"
                            : "bg-ok text-white hover:bg-accent-dark"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used inside ModalProvider");
  return ctx;
}
