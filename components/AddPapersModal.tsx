"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AddPapers from "./AddPapers";

// The "+ Add papers" button and the window it opens on top of the list.
// When the window closes after something was added, the list behind it reloads.
export default function AddPapersModal({ openByDefault = false }: { openByDefault?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (openByDefault && ref.current && !ref.current.open) ref.current.showModal();
  }, [openByDefault]);

  function open() {
    setChanged(false);
    ref.current?.showModal();
  }
  function onClose() {
    if (changed) router.refresh();
    if (openByDefault) router.replace("/");
  }

  return (
    <>
      <button type="button" className="primary big addbtn" onClick={open}>+ Add papers</button>
      <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="modal-body">
          <div className="modal-head">
            <h2>Add papers</h2>
            <button type="button" className="small" onClick={() => ref.current?.close()}>Close</button>
          </div>
          <AddPapers onAdded={() => setChanged(true)} />
        </div>
      </dialog>
    </>
  );
}
